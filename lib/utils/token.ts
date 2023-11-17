import { HardhatNetworkConfig, Network } from "hardhat/types";
import { MAINNET_ADDRESSES, GOERLI_ADDRESSES } from "../constants/tokens";

export const getTokenListForNetwork = (network: Network) => {
  // TODO: revisit this
  if (
    network.name == "localhost" ||
    (network.config as HardhatNetworkConfig).forking?.enabled
  ) {
    return MAINNET_ADDRESSES;
  }

  switch (network.name) {
    case "mainnet":
      return MAINNET_ADDRESSES;
    case "goerli":
      return GOERLI_ADDRESSES;
    default:
      throw new Error(`Unsupported network: ${network.config.chainId}`);
  }
};
