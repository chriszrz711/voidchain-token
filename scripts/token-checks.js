import assert from 'node:assert/strict';
import { getAddress, ZeroAddress } from 'ethers';
import { normalizeData } from './voidchain-rpc.js';

export const SUPPLY = 1_000_000n * 10n ** 18n;
export const TRANSFER = 100n * 10n ** 18n;
export function validateDeployment(tx, expected, runtime, from) {
  assert.equal(tx.status, 2, 'Deployment not confirmed');
  assert.equal(tx.includedInBlock, true, 'Deployment not included');
  assert.equal(tx.inputHash, expected.inputHash, 'Deployment input mismatch');
  assert.equal(tx.nonce, expected.nonce, 'Deployment nonce mismatch');
  assert.equal(getAddress(tx.from), getAddress(from), 'Deployment sender mismatch');
  assert.equal(getAddress(tx.to), ZeroAddress, 'Not a creation transaction');
  validateRuntime(tx.return_data, runtime);
  const address = getAddress(tx.contractAddress);
  assert.notEqual(address, ZeroAddress, 'Missing contract address');
  return address;
}

export function validateToken(token) {
  assert.equal(token.name, 'SimpleChain Token', 'Unexpected token name');
  assert.equal(token.symbol, 'SCT', 'Unexpected token symbol');
  assert.equal(token.decimals, '18', 'Unexpected token decimals');
  assert.equal(BigInt(token.totalSupply), SUPPLY, 'Unexpected total supply');
  assert.match(token.deployerBalance, /^\d+$/, 'Missing deployer balance');
  assert(BigInt(token.deployerBalance) <= SUPPLY, 'Balance exceeds supply');
}
export function validateTransfer(before, after) {
  validateToken(before);
  validateToken(after);
  assert.equal(BigInt(before.deployerBalance) - BigInt(after.deployerBalance), TRANSFER, 'Sender delta is not 100 SCT');
  assert.equal(BigInt(after.recipientBalance) - BigInt(before.recipientBalance), TRANSFER, 'Recipient delta is not 100 SCT');
  assert.equal(after.totalSupply, before.totalSupply, 'Supply changed');
}
export function validateRuntime(value, expected) {
  assert.equal(normalizeData(value).toLowerCase(), normalizeData(expected).toLowerCase(), 'Simulation returned unexpected runtime bytecode');
}
