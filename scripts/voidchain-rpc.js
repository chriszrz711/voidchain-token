export function unwrapRpc(body) {
  if (body.error) throw new Error(body.error.message || 'JSON-RPC error');
  if (!Object.hasOwn(body, 'result')) throw new Error('Missing RPC result');
  const result = body.result;
  if (result && typeof result === 'object' && Object.hasOwn(result, 'ret')) {
    if (String(result.ret) !== '0' || result.err) throw new Error(result.err || `VoidChain ret=${result.ret}`);
    if (result.content?.err) throw new Error(result.content.err);
    return result.content;
  }
  return result;
}

export function normalizeData(value) {
  if (typeof value !== 'string') throw new Error('Expected hex return data');
  const hex = value.replace(/^0x/i, '');
  if (!hex.length) throw new Error('Empty return data; token value is unknown, not zero');
  if (hex.length % 2 || !/^[0-9a-f]+$/i.test(hex)) throw new Error('Malformed hex return data');
  return `0x${hex}`;
}

// Intentionally read-only: even signed transactions go exclusively to eth_call.
const readMethods = new Set(['eth_chainId', 'eth_call', 'eth_getCode', 'eth_getTransactionReceipt', 'chain_queryInfo', 'chain_getKey', 'chain_queryTransaction']);
export async function rpc(url, method, params, id = '1') {
  if (!readMethods.has(method)) throw new Error('This diagnostic client only permits read-only methods');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: method.startsWith('chain_') ? '3.0' : '2.0', method, params, id }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  return unwrapRpc(await response.json());
}
