# VoidChain Token deployment verification

> Historical record. After cleanup, the former Paris configuration is now `hardhat.config.ts`; the original Shanghai configuration, artifacts, signed transaction and one-off scripts are under `archive/shanghai/`. Historical paths below describe the earlier layout. Use the root README for current commands and paths. The duplicate `reports/deployment-verification.json` was removed; its original contents remain in `reports/shanghai-failure-2026-09-28.json`. The legacy verifier may regenerate a fresh current-state report.

## Repair completed — 2026-09-28

An independent Paris build using Solidity **0.8.37** successfully deployed on Testnet 36500. The signed simulation returned exactly the compiled runtime bytecode before broadcast; the confirmed deployment's `return_data` also matches that runtime. All five Token getters and an actual **100 SCT transfer** passed verification.

| Item | Verified result |
| --- | --- |
| Contract | `0xF51c0CA6F7e9F687933b2269cbF6eF9B19f753C0` |
| Name / symbol / decimals | SimpleChain Token / SCT / 18 |
| Total supply | 1,000,000 SCT |
| Deployer balance after transfer | 999,900 SCT |
| Recipient | `0xe99E2B2fC7D8036714cc7735BeebC5143d961453` |
| Recipient balance | 100 SCT |
| Successful deployment hash | `0x645f6cb00cf6a66a64751e167efd0789d8484b021bca7a4f3bcb695e67fe28e5` |
| Deployment block / nonce | 1310981 / 1 |
| Transfer hash | `0xb552d840a8574c488e48d8e52a50edf4038b177ad227ed32e71b6c82d2434add` |
| Transfer block / nonce | 1310983 / 2 |

**Additional VoidChain compatibility finding:** nonce 1 predicts `0x9F50fd2aF967BF2Eb616026Eddcd981CEA13622a` under Ethereum CREATE rules, but the native confirmed transaction reports the original `0xf51c...53c0` address. Token reads work at the native address and return empty at the Ethereum prediction. The script therefore validates the confirmed sender, nonce, input, returned runtime and on-chain state, then uses the native address. This is a **new successful deployment**, not evidence that the original Shanghai attempt succeeded. The exact internal address-generation rule has not been established.

```sh
npm test                 # RPC parsing and execution/state validation regression tests
npm run verify:paris     # Read-only check of the successful deployment and both balances
npm run repair:execute   # Resume recorded workflow; completed transfers are only verified
```

For a fresh local setup of this same workflow, `npm run compile:paris` builds into `artifacts-paris/` and `cache-paris/`; `npm run simulate:paris` performs signed read-only simulation before any deployment record exists. It refuses to simulate a further deployment once one is recorded.

`reports/paris-deployment.json` is both the public evidence report and the resume journal. **Keep it:** transaction hashes are saved before broadcast, and reruns never automatically rebroadcast or create another transaction for a recorded step. An uncertain broadcast stops for checking the recorded hash. Only the `execute` command can broadcast, and only after successful simulation. Do not delete the journal to bypass a pending or failed step. A lock prevents concurrent execute processes; remove a stale lock only after confirming no process is running.

The second wallet's private key is stored only in `.wallets/sct-recipient.json` (file permission `0600`, directory `0700`, excluded by `.gitignore`). It is never printed. The existing `.env` is read locally for signing and is unchanged. No faucet funding was needed for the recipient.

The original Shanghai build/configuration and signed transaction remain intact. The original failure evidence is preserved in `reports/shanghai-failure-2026-09-28.json`. `verify:deployment` is the legacy original-transaction diagnostic; today's readable state at the reused address must not be attributed to the old transaction.

Files added or changed for this repair:

- `hardhat.paris.config.ts`: independent Paris build configuration.
- `scripts/repair-deployment.js`: simulate, execute/resume and read-only verify commands.
- `scripts/token-checks.js` and `test/token-checks.test.js`: runtime, native deployment address, metadata and exact transfer-delta validation.
- `scripts/verify-deployment.js`: distinguish current readable address state from original deployment success.
- `package.json`, `.gitignore`, `README.md`: commands, generated/secret file exclusions and usage.
- `reports/paris-deployment.json`: confirmed deployment and transfer evidence, plus resume journal.
- `reports/shanghai-failure-2026-09-28.json`: preserved original failure snapshot.
- `.wallets/sct-recipient.json`: locally saved recipient secret; never include in shared reports or commits.

## Original Shanghai attempt — historical evidence before repair

The original deployment did **not produce a usable Token** at
`0xf51c0ca6f7e9f687933b2269cbf6ef9b19f753c0`.

Transaction: `0xc625f5ba242db3ac198622a8f671d049e73311c722f355c4b21052eb0b5740b8`.

Evidence from the official testnet endpoint:

- `queryTx` reports status `2`, block `1310952`; `queryBlock` includes the hash.
- The signed transaction hash, sender, derived CREATE address and input match the existing deployment. Its input also matches the compiled artifact plus constructor argument `1000000`.
- `eth_call([existingSignedTransaction])`, a **read-only simulation**, returns `invalid opcode: opcode 0x5f not defined`.
- The bytecode's first `PUSH0` (`0x5f`) is at byte offset 36. Local build metadata is Solidity `0.8.37+commit.f401782d`, EVM `shanghai`.
- Contract `queryAddress` returns `find rec fail`. All five Token getters return empty bytes, not ABI-encoded values. An identity-precompile control call correctly returns `12345678`.

The current testnet executor rejects Shanghai `PUSH0`. This accounts for the absent contract state and empty getters. The official Shanghai guide explicitly describes a **mainnet** upgrade; it does not establish that this testnet executor has the same upgrade.

The replay uses the **current** executor/state, not a historical execution trace. The endpoint does not expose `eth_getTransactionReceipt`, `eth_getCode`, `eth_getStorageAt` or `debug_traceTransaction`, so an original historical failure receipt is unavailable. `queryTx.status=2` confirms processing, not successful constructor execution by itself.

Actual on-chain `name`, `symbol`, `decimals`, `totalSupply`, and deployer SCT balance are **unavailable**, not zero. Source-code expectations are `SimpleChain Token`, `SCT`, `18`, and initial supply `1,000,000 SCT` (`1000000000000000000000000` base units). These are not verified on-chain values.

At this initial investigation stage, no new deployment, second wallet, or transfer had been performed. The subsequent repair above followed signed Paris simulation before broadcasting, used freshly queried nonces, and preserved the original Solidity and Shanghai configuration.

## Repeat the checks

```sh
npm test
npm run verify:deployment
```

The verifier resolves files relative to its own project directory. It does not load `.env`, access private keys, sign transactions, create wallets, or broadcast. It reads existing public `signed-tx.txt` and the artifact. A read-only RPC allowlist prevents sending deployments or transfers. Do not run the older `deploy.js`/`sign-deploy.js` scripts as part of verification.

Output: `reports/deployment-verification.json`, replaced with fresh evidence on each run. Exit codes: `0` = all Token getters readable, `2` = a readable Token was not established (expected here), `1` = setup/network failure. Readability alone is not a transfer test.

`VOIDCHAIN_RPC_URL` can point to an alternate testnet node; the script requires chain ID 36500. It verifies this specific deployment and rejects a different `signed-tx.txt`.

## Query forms and compatibility issues

**Token state:** ABI-encode the getter and pass exactly one transaction object:

```js
const value = await rpc(url, 'eth_call', [{
  to: contractAddress,
  data: abi.encodeFunctionData('balanceOf', [deployer]),
  gas: '0x1406f40',
}]);
const balance = abi.decodeFunctionResult('balanceOf', normalizeData(value))[0];
```

Use the same form for the other four getters. Do not append `"latest"`. `normalizeData` adds missing `0x`, preserves bytes, and rejects empty data instead of inventing a zero balance.

**Constructor diagnostics:** official `eth_call` also supports a single signed raw transaction parameter. Passing the already-signed deployment exposes the opcode error. An unsigned creation object instead crashes this gateway handler. **Never substitute `eth_sendRawTransaction` for this diagnostic.**

**Native read-only interface:** `chain_queryTransaction`, JSON-RPC `3.0`, accepts `[{from,to,data,sliceno:'0x0'}, '', 'encryp=none']`; use the `chain_getKey` session as `id`. Inspect outer `result.ret/err` and inner `content.err`, then decode `content.ret_data`. This gateway returns `Session not found!` even with a fresh session, so this path was unusable here. No private key was imported into the gateway.

**Confirmation:** `chain_queryInfo` with `['pubChainQuery','op=queryTx&hash=...&sliceno=0','encryp=none']`, followed by numeric-height `queryBlock`. Address queries use `value=ADDRESS<->latest&sliceno=0`. A derived address and status `2` are insufficient without contract state or execution-success evidence.

Other pitfalls:

- Errors may arrive under `result.ret='101'` instead of JSON-RPC `error`.
- `eth_call` returns prefixless hex in the identity control. Previously observed `eth_getBalance` has the same prefix issue; native balance is not SCT balance.
- Platform-token 9 decimals must not replace this Token's intended 18 decimals.
- `eth_getBlockByNumber('latest')` and `queryBlockTrans` have previously observed compatibility failures; this verifier avoids them.
- `eth_estimateGas` returned the same `0x1406f40` for deployment and the identity precompile. This does not establish successful execution or prove that 3,000,000 gas caused failure.

## Official references

- [eth_call, including signed transaction form](https://docs.voidchain.net/zh/api-reference/ethereum-compatible-interface/eth-call/)
- [Native query contract](https://docs.voidchain.net/en/api-reference/transaction-interface/query-contract/)
- [Native query/test return fields](https://github.com/voidchain-net/voidchain-api-docs/blob/main/docs/07_Query_Test_Interface.md)
- [Transaction result status definitions](https://docs.voidchain.net/zh/api-reference/public-queries/transaction-result-query/)
- [Session acquisition](https://docs.voidchain.net/zh/api-reference/login-and-registration/session-id/)
- [Shanghai setup and opcode troubleshooting](https://docs.voidchain.net/en/setup/voidchain-shanghai-setup/)
- [Official testnet endpoint](https://docs.voidchain.net/en/setup/send-request/)
