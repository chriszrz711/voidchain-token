import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { Wallet, ContractFactory, Interface, Transaction, getCreateAddress, keccak256, formatUnits } from 'ethers';
import { rpc, unwrapRpc, normalizeData } from './voidchain-rpc.js';
import { validateToken, validateTransfer, validateRuntime, validateDeployment, SUPPLY, TRANSFER } from './token-checks.js';

const root = new URL('../', import.meta.url);
const endpoint = process.env.VOIDCHAIN_RPC_URL || 'https://api-backend.voidchain.net/api';
const deployer = '0xAfCe760312063CD81F9721967bF33C048cb23061';
const mode = process.argv[2] || 'simulate';
const journalPath = new URL('reports/paris-deployment.json', root);
const walletPath = new URL('.wallets/sct-recipient.json', root);
const lockPath = new URL('reports/.repair.lock', root);
const artifact = JSON.parse(await fs.readFile(new URL('artifacts-paris/contracts/SimpleToken.sol/SimpleToken.json', root), 'utf8'));
const abi = new Interface(artifact.abi);
const query = content => rpc(endpoint, 'chain_queryInfo', ['pubChainQuery', content, 'encryp=none']);
let journal;

async function loadJson(path) {
  try { return JSON.parse(await fs.readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Cannot read local workflow record'); }
}
async function save() {
  journal.updatedAt = new Date().toISOString();
  const tmp = new URL('reports/.paris-deployment.tmp', root);
  await fs.writeFile(tmp, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, journalPath);
}
async function nonce() {
  const account = await query(`op=queryAddress&value=${deployer}<->latest&sliceno=0`);
  if (!Number.isSafeInteger(account.Nonce) || account.Nonce < 0) throw new Error('Invalid native account nonce');
  return account.Nonce;
}
async function readToken(address, recipient) {
  const token = {};
  for (const name of ['name', 'symbol', 'decimals', 'totalSupply', 'balanceOf']) {
    const raw = await rpc(endpoint, 'eth_call', [{ to: address, data: abi.encodeFunctionData(name, name === 'balanceOf' ? [deployer] : []), gas: '0x2dc6c0' }]);
    const value = abi.decodeFunctionResult(name, normalizeData(raw))[0];
    token[name === 'balanceOf' ? 'deployerBalance' : name] = String(value);
  }
  if (recipient) {
    const raw = await rpc(endpoint, 'eth_call', [{ to: address, data: abi.encodeFunctionData('balanceOf', [recipient]), gas: '0x2dc6c0' }]);
    token.recipientBalance = abi.decodeFunctionResult('balanceOf', normalizeData(raw))[0].toString();
  }
  validateToken(token);
  return token;
}
async function confirmed(hash) {
  for (let attempt = 0; attempt < 30; attempt++) {
    let rows;
    try { rows = await query(`op=queryTx&hash=${hash}&sliceno=0`); }
    catch (error) { if (!/find|not found/i.test(error.message)) throw error; }
    const tx = rows?.find(item => item.transactionHash?.toLowerCase() === hash.toLowerCase());
    if (tx?.status === 3) throw new Error('Transaction failed; refusing automatic replacement');
    if (tx?.status === 2) {
      const block = await query(`op=queryBlock&number=${tx.blockNumber}&sliceno=0`);
      if (!block.Txns?.includes(hash)) throw new Error('Transaction missing from reported block');
      const { tx_content, ...summary } = tx;
      return { ...summary, inputHash: keccak256(normalizeData(tx_content)), includedInBlock: true };
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Confirmation pending; journal preserved. Rerun execute to check the SAME hash; do not delete the journal');
}
async function broadcast(raw, expectedHash) {
  // Exactly one attempt. Persist hash before calling this, including when the response is lost.
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [raw], id: '1' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Broadcast response unavailable; journal preserved, no automatic retry');
  const result = unwrapRpc(await response.json());
  if (typeof result !== 'string' || result.toLowerCase() !== expectedHash.toLowerCase()) throw new Error('Broadcast hash mismatch; journal preserved');
  return result;
}
async function signed(wallet, fields) {
  return wallet.signTransaction({ type: 0, chainId: 36500, gasLimit: 3000000, gasPrice: 0, ...fields });
}
async function signer() {
  config({ path: fileURLToPath(new URL('.env', root)), quiet: true });
  let wallet;
  try { wallet = new Wallet(process.env.PRIVATE_KEY); } catch { throw new Error('Invalid local signer configuration'); }
  if (wallet.address !== deployer) throw new Error('Unexpected deployer; refusing to sign');
  return wallet;
}
async function simulate(wallet) {
  const nextNonce = await nonce();
  const data = (await new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(1_000_000)).data;
  const raw = await signed(wallet, { nonce: nextNonce, data });
  const runtime = normalizeData(await rpc(endpoint, 'eth_call', [raw]));
  validateRuntime(runtime, artifact.deployedBytecode);
  return { raw, summary: { nonce: nextNonce, hash: keccak256(raw), address: getCreateAddress({ from: deployer, nonce: nextNonce }), inputHash: keccak256(data), runtimeHash: keccak256(runtime), gasLimit: '3000000', simulationPassed: true } };
}
async function ensureRecipient() {
  let secret = await loadJson(walletPath);
  if (!secret) {
    const wallet = Wallet.createRandom();
    await fs.mkdir(new URL('.wallets/', root), { recursive: true, mode: 0o700 });
    await fs.writeFile(walletPath, JSON.stringify({ address: wallet.address, privateKey: wallet.privateKey }) + '\n', { flag: 'wx', mode: 0o600 });
    secret = { address: wallet.address, privateKey: wallet.privateKey };
  }
  let address;
  try { address = new Wallet(secret.privateKey).address; } catch { throw new Error('Invalid saved recipient wallet'); }
  if (address !== secret.address || address === deployer) throw new Error('Recipient wallet mismatch');
  return address;
}
function printState(token) {
  console.log(JSON.stringify({ contractAddress: journal.deployment.address, deploymentHash: journal.deployment.hash, name: token.name, symbol: token.symbol, decimals: token.decimals, totalSupply: formatUnits(token.totalSupply, 18), deployerBalance: formatUnits(token.deployerBalance, 18), recipient: journal.recipient || null, recipientBalance: token.recipientBalance == null ? null : formatUnits(token.recipientBalance, 18), transferHash: journal.transfer?.hash || null, transferVerified: journal.transfer?.verified === true }, null, 2));
}
async function main() {
  if (!['simulate', 'execute', 'verify'].includes(mode)) throw new Error('Usage: repair-deployment.js simulate|execute|verify');
  if (BigInt(await rpc(endpoint, 'eth_chainId', [])) !== 36500n) throw new Error('Wrong network');
  await fs.mkdir(new URL('reports/', root), { recursive: true });
  journal = await loadJson(journalPath);
  if (journal && (journal.chainId !== 36500 || journal.deployer !== deployer || journal.artifactHash !== keccak256(artifact.bytecode))) throw new Error('Journal/artifact mismatch; manual review required');
  if (mode === 'verify') {
    if (!journal?.deployment) throw new Error('No replacement deployment recorded');
    const token = await readToken(journal.deployment.address, journal.recipient);
    if (journal.transfer?.before) validateTransfer(journal.transfer.before, token);
    printState(token);
    return;
  }
  const wallet = await signer();
  if (mode === 'simulate') {
    if (journal?.deployment) throw new Error('Replacement already recorded; use verify or execute to resume');
    console.log(JSON.stringify((await simulate(wallet)).summary, null, 2));
    return;
  }
  const lock = await fs.open(lockPath, 'wx').catch(() => { throw new Error('Workflow lock exists. Check for a running process before removing it'); });
  try {
    // Re-read under lock to avoid racing another execute process.
    journal = await loadJson(journalPath) || { chainId: 36500, deployer, evmVersion: 'paris', artifactHash: keccak256(artifact.bytecode), createdAt: new Date().toISOString() };
    if (!journal.deployment) {
      const candidate = await simulate(wallet);
      if (await nonce() !== candidate.summary.nonce) throw new Error('Nonce changed during simulation');
      journal.deployment = candidate.summary;
      await save();
      await broadcast(candidate.raw, candidate.summary.hash);
      console.log('Replacement deployment broadcast:', candidate.summary.hash);
    }
    journal.deployment.confirmation = await confirmed(journal.deployment.hash);
    // VoidChain's observed CREATE address differs from Ethereum's nonce-derived prediction.
    // Accept only the native confirmed address after checking identity, input and runtime.
    journal.deployment.ethereumPredictedAddress = getCreateAddress({ from: deployer, nonce: journal.deployment.nonce });
    journal.deployment.address = validateDeployment(journal.deployment.confirmation, journal.deployment, artifact.deployedBytecode, deployer);
    const token = await readToken(journal.deployment.address);
    journal.deployment.tokenVerified = true;
    journal.deployment.lastTokenState = token;
    await save();
    console.log('On-chain token getters verified.');
    if (!journal.transfer) {
      if (BigInt(token.deployerBalance) !== SUPPLY) throw new Error('Initial owner balance differs from full supply');
      journal.recipient = await ensureRecipient();
      await save();
      const before = await readToken(journal.deployment.address, journal.recipient);
      if (BigInt(before.recipientBalance) !== 0n) throw new Error('Recipient already has SCT; refusing an additional transfer');
      const nextNonce = await nonce();
      const data = abi.encodeFunctionData('transfer', [journal.recipient, TRANSFER]);
      const raw = await signed(wallet, { nonce: nextNonce, to: journal.deployment.address, data });
      const result = normalizeData(await rpc(endpoint, 'eth_call', [raw]));
      if (abi.decodeFunctionResult('transfer', result)[0] !== true) throw new Error('Transfer simulation did not return true');
      if (await nonce() !== nextNonce) throw new Error('Nonce changed during transfer simulation');
      journal.transfer = { nonce: nextNonce, hash: Transaction.from(raw).hash, inputHash: keccak256(data), amount: TRANSFER.toString(), before, simulationPassed: true };
      await save();
      await broadcast(raw, journal.transfer.hash);
      console.log('100 SCT transfer broadcast:', journal.transfer.hash);
    }
    journal.transfer.confirmation = await confirmed(journal.transfer.hash);
    if (journal.transfer.confirmation.inputHash !== journal.transfer.inputHash || journal.transfer.confirmation.to.toLowerCase() !== journal.deployment.address.toLowerCase()) throw new Error('Confirmed transfer does not match signed input');
    const after = await readToken(journal.deployment.address, journal.recipient);
    validateTransfer(journal.transfer.before, after);
    journal.transfer.after = after;
    journal.transfer.verified = true;
    await save();
    printState(after);
  } finally {
    await lock.close();
    await fs.unlink(lockPath);
  }
}
main().catch(error => {
  // No stacks, environment dumps, private keys, or signed payloads.
  console.error('Workflow stopped:', error.shortMessage || error.message);
  process.exitCode = 1;
});
