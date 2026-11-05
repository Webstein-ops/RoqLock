import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatIgnitionEthersPlugin from "@nomicfoundation/hardhat-ignition-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [
    hardhatToolboxMochaEthersPlugin,
    hardhatIgnitionEthersPlugin,
  ],

  solidity: {
    profiles: {
      default: { version: "0.8.34" },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },

  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    baseSepolia: {
      type: "http",
      chainType: "op",
      chainId: 84532,
      url: "https://sepolia.base.org",
      accounts: [configVariable("BASE_SEPOLIA_PRIVATE_KEY")],
    },
  },

  paths: {
    tests: { mocha: "./test" },
  },
});