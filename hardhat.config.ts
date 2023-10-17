import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import dotenv from "dotenv";

dotenv.config();

const { INFURA_API_KEY } = process.env;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  solidity: "0.8.19",
  paths: {
    deploy: "scripts",
  },
  networks: {
    hardhat: {
      // TODO: disable forking for unit and integration tests?
      forking: {
        url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
        blockNumber: 18192031,
      },
    },
  },
};

export default config;
