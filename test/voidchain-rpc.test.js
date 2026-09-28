import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import { unwrapRpc, normalizeData } from '../scripts/voidchain-rpc.js';

test('VoidChain execution failure inside result is not success', () => {
  assert.throws(() => unwrapRpc({ result: { ret: '101', err: 'invalid opcode: opcode 0x5f not defined', content: null } }), /opcode 0x5f/);
});
test('standard JSON-RPC errors are rejected', () => {
  assert.throws(() => unwrapRpc({ error: { code: -32601, message: 'Method not found' } }), /Method not found/);
});
test('native query exposes content and rejects nested execution errors', () => {
  assert.deepEqual(unwrapRpc({ result: { ret: '0', err: '', content: { ret_data: '1234', err: '' } } }), { ret_data: '1234', err: '' });
  assert.throws(() => unwrapRpc({ result: { ret: '0', content: { err: 'execution reverted' } } }), /execution reverted/);
});
test('prefixless ABI data decodes without changing bytes', () => {
  const abi = new Interface(['function totalSupply() view returns (uint256)']);
  const encoded = abi.encodeFunctionResult('totalSupply', [10n ** 24n]);
  assert.equal(abi.decodeFunctionResult('totalSupply', normalizeData(encoded.slice(2)))[0], 10n ** 24n);
});
test('empty and malformed data cannot be interpreted as token zero', () => {
  for (const value of ['', '0x', '0x0', 'hello', null]) assert.throws(() => normalizeData(value));
});
