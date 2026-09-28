# Shanghai 历史资料

此目录保存首次失败部署的原始资料，不用于当前部署。

- `artifacts/`：原编译产物及编译输入，供旧交易只读验证使用。
- `signed-tx.txt`：已广播的旧签名交易，属于公开交易数据，不是私钥。
- `bytecode.txt`、`deploy-data.txt`：当时导出的字节码和构造参数。
- `hardhat.config.ts.txt`：原 Shanghai 配置。
- `scripts/*.js.txt`：已退役的一次性脚本，改为文本以免作为活动入口误用。

旧脚本使用的路径和 nonce 已过时，钱包脚本还会打印私钥。不要执行这些历史脚本。当前入口见项目根目录 README。
