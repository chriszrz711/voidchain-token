import fs from 'node:fs/promises';
import { Interface, Transaction, ContractFactory, getCreateAddress, keccak256, formatUnits } from 'ethers';
import { rpc, normalizeData } from './voidchain-rpc.js';

const root = new URL('../', import.meta.url);
const url = process.env.VOIDCHAIN_RPC_URL || 'https://api-backend.voidchain.net/api';
const hash = '0xc625f5ba242db3ac198622a8f671d049e73311c722f355c4b21052eb0b5740b8';
const deployer = '0xAfCe760312063CD81F9721967bF33C048cb23061';
const address = '0xf51c0ca6f7e9f687933b2269cbf6ef9b19f753c0';
const report = { checkedAt: new Date().toISOString(), endpoint: new URL(url).origin, hash, address, deployer, readOnly: true, checks: {}, token: {} };

async function check(name, action) {
  try {
    const value = await action();
    report.checks[name] = { ok: true, value };
    return value;
  } catch (error) {
    // No request bodies, signed transactions, sessions, environment, or stack dumps.
    report.checks[name] = { ok: false, error: error.shortMessage || error.message };
    return undefined;
  }
}
const query = (content) => rpc(url, 'chain_queryInfo', ['pubChainQuery', content, 'encryp=none']);

async function main() {
  const chainId = await rpc(url, 'eth_chainId', []);
  if (BigInt(chainId) !== 36500n) throw new Error('Wrong chain ID; expected VoidChain Testnet 36500');
  report.chainId = 36500;
  const artifact = JSON.parse(await fs.readFile(new URL('archive/shanghai/artifacts/contracts/SimpleToken.sol/SimpleToken.json', root), 'utf8'));
  const abi = new Interface(artifact.abi);
  // Existing signed transaction contains public transaction data, not a private key.
  // It is never logged or broadcast. The .env file is not loaded at all.
  const raw = (await fs.readFile(new URL('archive/shanghai/signed-tx.txt', root), 'utf8')).trim();
  let tx;
  try { tx = Transaction.from(raw); } catch { throw new Error('Cannot decode existing signed-tx.txt'); }
  if (tx.hash !== hash || tx.from !== deployer || tx.chainId !== 36500n || tx.to !== null) throw new Error('Existing signed transaction does not match this deployment');
  if (getCreateAddress({ from: tx.from, nonce: tx.nonce }).toLowerCase() !== address) throw new Error('Deployment address mismatch');
  const expected = await new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(1_000_000);
  report.localTransaction = { nonce: tx.nonce, gasLimit: tx.gasLimit.toString(), gasPrice: tx.gasPrice.toString(), dataHash: keccak256(tx.data), matchesArtifactAndConstructor: expected.data === tx.data };
  const code = Buffer.from(artifact.bytecode.slice(2), 'hex');
  for (let pc = 0; pc < code.length; pc++) {
    if (code[pc] === 0x5f) { report.localTransaction.firstPush0Pc = pc; break; }
    if (code[pc] >= 0x60 && code[pc] <= 0x7f) pc += code[pc] - 0x5f;
  }
  const transaction = await check('transaction', async () => {
    const rows = await query(`op=queryTx&hash=${hash}&sliceno=0`);
    const row = rows?.find(item => item.transactionHash?.toLowerCase() === hash);
    if (!row) throw new Error('Deployment transaction not found');
    const { tx_content, ...summary } = row;
    return { ...summary, inputMatchesSignedTransaction: normalizeData(tx_content).toLowerCase() === tx.data.toLowerCase() };
  });
  if (transaction) await check('block', async () => {
    const block = await query(`op=queryBlock&number=${transaction.blockNumber}&sliceno=0`);
    return { ...block, includesDeployment: block.Txns?.includes(hash) === true };
  });
  await check('contractAccount', () => query(`op=queryAddress&value=${address}<->latest&sliceno=0`));
  await check('deployerAccount', () => query(`op=queryAddress&value=${deployer.toLowerCase()}<->latest&sliceno=0`));
  await check('receipt', () => rpc(url, 'eth_getTransactionReceipt', [hash]));
  await check('code', () => rpc(url, 'eth_getCode', [address, 'latest']));
  await check('identityControl', async () => {
    const result = await rpc(url, 'eth_call', [{ to: '0x0000000000000000000000000000000000000004', data: '0x12345678', gas: '0x2dc6c0' }]);
    if (normalizeData(result) !== '0x12345678') throw new Error('Identity precompile control failed');
    return result;
  });
  for (const name of ['name', 'symbol', 'decimals', 'totalSupply', 'balanceOf']) {
    const data = abi.encodeFunctionData(name, name === 'balanceOf' ? [deployer] : []);
    const result = await check(`eth_call.${name}`, async () => {
      const rawResult = await rpc(url, 'eth_call', [{ to: address, data, gas: '0x1406f40' }]);
      const value = abi.decodeFunctionResult(name, normalizeData(rawResult))[0];
      return { raw: rawResult, decoded: typeof value === 'bigint' ? value.toString() : value };
    });
    report.token[name] = result?.decoded ?? null;
  }
  await check('nativeQuery', async () => {
    const session = await rpc(url, 'chain_getKey', []);
    if (!session?.session) throw new Error('Session acquisition failed');
    return rpc(url, 'chain_queryTransaction', [{ from: deployer, to: address, data: abi.encodeFunctionData('name'), sliceno: '0x0' }, '', 'encryp=none'], session.session);
  });
  // Documented eth_call signed-transaction form exposes constructor execution errors.
  await check('signedDeploymentSimulation', () => rpc(url, 'eth_call', [raw]));
  const readable = Object.values(report.token).every(value => value !== null);
  const unsupportedPush0 = /invalid opcode: opcode 0x5f not defined/.test(report.checks.signedDeploymentSimulation.error || '');
  const absent = /find rec fail/.test(report.checks.contractAccount.error || '');
  const inputsMatch = report.localTransaction.matchesArtifactAndConstructor && transaction?.inputMatchesSignedTransaction;
  report.verdict = readable ? 'ADDRESS_READABLE_ORIGINAL_EXECUTION_UNPROVEN' : unsupportedPush0 && absent && inputsMatch ? 'DEPLOYMENT_NOT_USABLE_PUSH0_UNSUPPORTED' : 'INCONCLUSIVE';
  report.historicalReceiptAvailable = report.checks.receipt.ok;
  report.note = 'Simulation and getters use current state, not a historical receipt. A later VoidChain deployment may reuse this address. Readable state, status=2 and a contractAddress do not prove that THIS original transaction successfully constructed the token. See paris-deployment.json for the successful replacement.';
  if (readable) {
    report.token.totalSupplyFormatted = formatUnits(report.token.totalSupply, Number(report.token.decimals));
    report.token.deployerBalanceFormatted = formatUnits(report.token.balanceOf, Number(report.token.decimals));
  }
  report.transfer = { performed: false, reason: 'Read-only verifier; no wallet creation, signing, broadcast, or automatic redeployment' };
  await fs.mkdir(new URL('reports/', root), { recursive: true });
  await fs.writeFile(new URL('reports/deployment-verification.json', root), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ verdict: report.verdict, contractAddress: address, token: report.token, deploymentSimulation: report.checks.signedDeploymentSimulation, report: 'reports/deployment-verification.json' }, null, 2));
  process.exitCode = readable ? 0 : 2;
}
main().catch(() => {
  console.error('Verification aborted before completion. Check RPC connectivity, chain ID, and the existing public deployment/artifact files.');
  process.exitCode = 1;
});
