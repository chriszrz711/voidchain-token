# VoidChain Token

已验证的 VoidChain Testnet Token 项目，使用 Solidity 0.8.37、EVM **Paris**，Chain ID **36500**。

## 当前部署

- 合约：`0xf51c0ca6f7e9f687933b2269cbf6ef9b19f753c0`
- 名称 / 符号 / 精度：SimpleChain Token / SCT / 18
- 总量：1,000,000 SCT
- 已完成 100 SCT 转账；验证时部署者余额 999,900 SCT，第二钱包余额 100 SCT。
- 交易哈希及验证记录：[reports/paris-deployment.json](reports/paris-deployment.json)

## 常用命令

首次克隆后先安装依赖并编译，公开仓库不包含本地生成的 Paris 产物：

```sh
npm ci
npm run compile
npm test
npm run verify:paris
```

只读验证不需要私钥。需要签名时，在本地将 `.env.example` 复制为 `.env` 并自行填写私钥，不要把私钥发到 GitHub。此项目的执行脚本绑定已记录的测试部署及部署者地址，不是任意钱包的通用部署入口。公开报告只包含地址、交易及验证数据，不包含钱包私钥。

```sh
npm test                 # 回归测试
npm run compile          # 默认 Paris，产物写入 artifacts-paris/
npm run verify:paris     # 只读验证当前合约和双方余额
```

`npm run compile:paris` 保留为编译别名。`npm run repair:execute` 用于继续已有部署/转账流程，完成后重复运行仅核验已记录的交易。该命令可以广播交易，请保留 `reports/paris-deployment.json`，不要删除日志来绕过检查。

`npm run simulate:paris` 仅用于尚未建立部署记录时的只读模拟；已有记录时会拒绝再次准备部署。`npm run verify:deployment` 是旧 Shanghai 交易的只读诊断，使用归档资料，生成 `reports/deployment-verification.json`。当前地址可读并不代表旧交易成功。

## 目录

| 路径 | 用途 |
| --- | --- |
| `contracts/` | Solidity 源码 |
| `scripts/` | 当前部署、验证和 RPC 兼容代码 |
| `test/` | 回归测试 |
| `hardhat.config.ts` | 唯一有效的编译配置：Paris |
| `reports/` | 部署日志、成功验证证据、原失败快照 |
| `docs/DEPLOYMENT_HISTORY.md` | 调试历史和兼容性说明 |
| `archive/shanghai/` | 旧配置、脚本、签名交易、字节码和编译证据 |
| `artifacts-paris/`, `cache-paris/` | 可重新编译生成的产物与缓存 |
| `node_modules/` | 当前运行依赖，保留以便直接执行命令 |

`.env` 和 `.wallets/` 是本地秘密文件，保持原位并被 Git 忽略。第二钱包私钥文件权限为 `0600`，不得输出或提交。归档脚本改为 `.txt`，仅供阅读，不是可用入口；其中旧钱包脚本会打印私钥，不应运行。

## 兼容性要点

- 当前测试网不支持 Shanghai `PUSH0`；默认使用已实测通过的 Paris。
- `eth_call` 使用单参数；返回值可能缺少 `0x`，空返回不能解释为零。
- `queryTx.status=2` 不足以证明执行成功，还需检查运行时代码和 Token 状态。
- 实际合约地址可能不同于 Ethereum CREATE 公式预测值，应核对原生确认结果及状态。
- 详细证据与官方文档链接见 [部署历史](docs/DEPLOYMENT_HISTORY.md)。

## 本次整理

旧的一次性脚本及散落的交易文件已归档；重复的失败报告只保留 `reports/shanghai-failure-2026-09-28.json`；旧 Shanghai 缓存已清理。原 Shanghai 配置归档为文本，原 Paris 配置成为默认配置，消除双配置误用。
