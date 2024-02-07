import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import dotenv from "dotenv";

dotenv.config();

const INFURA_API_KEY = process.env.INFURA_API_KEY || "";
const GOERLI_PRIVATE_KEY = process.env.GOERLI_PRIVATE_KEY || "";

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

if (config.networks) {
  if (GOERLI_PRIVATE_KEY) {
    config.networks.goerli = {
      url: `https://goerli.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [GOERLI_PRIVATE_KEY],
    };
  }
}

export default config;
