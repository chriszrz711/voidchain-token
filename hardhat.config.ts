import { defineConfig } from 'hardhat/config';

export default defineConfig({
  paths: { artifacts: './artifacts-paris', cache: './cache-paris' },
  solidity: {
    version: '0.8.37',
    settings: {
      evmVersion: 'paris',
      optimizer: { enabled: true, runs: 200 },
    },
  },
});
