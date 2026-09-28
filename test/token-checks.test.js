import test from 'node:test';
import assert from 'node:assert/strict';
import { validateToken, validateTransfer, validateRuntime, validateDeployment } from '../scripts/token-checks.js';

const token = { name: 'SimpleChain Token', symbol: 'SCT', decimals: '18', totalSupply: '1000000000000000000000000', deployerBalance: '1000000000000000000000000' };
test('native deployment address is accepted only with matching execution evidence', () => {
  const tx = {status: 2, includedInBlock: true, nonce: 1, from: '0xafce760312063cd81f9721967bf33c048cb23061', to: '0x0000000000000000000000000000000000000000', contractAddress: '0xf51c0ca6f7e9f687933b2269cbf6ef9b19f753c0', inputHash: '0x1234', return_data: '602a'};
  const expected = {nonce: 1, inputHash: '0x1234'};
  const from = '0xAfCe760312063CD81F9721967bF33C048cb23061';
  assert.equal(validateDeployment(tx, expected, '0x602a', from).toLowerCase(), tx.contractAddress);
  for (const change of [{inputHash:'0x4321'}, {nonce:0}, {return_data:''}, {contractAddress:'0x0000000000000000000000000000000000000000'}]) {
    assert.throws(() => validateDeployment({...tx,...change}, expected, '0x602a', from));
  }
});
test('deployment gate rejects empty, wrong, or inconsistent token state', () => {
  assert.doesNotThrow(() => validateToken(token));
  for (const change of [{name: null}, {symbol: 'BAD'}, {decimals: '9'}, {totalSupply: '0'}, {deployerBalance: '1000000000000000000000001'}]) {
    assert.throws(() => validateToken({...token, ...change}));
  }
});
test('simulation must return the exact nonempty runtime', () => {
  assert.doesNotThrow(() => validateRuntime('0x602a', '0x602a'));
  assert.throws(() => validateRuntime('', '0x602a'));
  assert.throws(() => validateRuntime('0x602b', '0x602a'));
});
test('100 SCT requires both exact balance changes and unchanged supply', () => {
  const before = {...token, recipientBalance: '0'};
  const after = {...token, deployerBalance: '999900000000000000000000', recipientBalance: '100000000000000000000'};
  assert.doesNotThrow(() => validateTransfer(before, after));
  for (const change of [{deployerBalance: before.deployerBalance}, {recipientBalance: '0'}, {totalSupply: '999900000000000000000000'}]) {
    assert.throws(() => validateTransfer(before, {...after, ...change}));
  }
});
