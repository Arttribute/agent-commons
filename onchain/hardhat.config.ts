import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require("dotenv").config({ path: __dirname + "/.env" });
require("@nomicfoundation/hardhat-verify");

const privateKey = process.env.PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      chainId: 1337,
    },
    "base-mainnet": {
      url: "https://mainnet.base.org",
      accounts: [privateKey],
      gasPrice: 1000000000,
    },
    "base-sepolia": {
      url: "https://sepolia.base.org",
      accounts: [privateKey],
      gasPrice: 1000000000,
    },
    "base-local": {
      url: "http://localhost:8545",
      accounts: [privateKey],
      gasPrice: 1000000000,
    },
    "op-sepolia": {
      chainId: 11155420,
      url: `https://optimism-sepolia.blockpi.network/v1/rpc/public`,
      accounts: [privateKey],
    },
    "arbitrum-sepolia": {
      chainId: 421614,
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: [privateKey],
      gasPrice: 5189860000,
    },
  },
  etherscan: {
    apiKey: {
      "base-sepolia": "empty",
    },
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://base-sepolia.blockscout.com/api",
          browserURL: "https://base-sepolia.blockscout.com",
        },
      },
    ],
  },
};

export default config;
