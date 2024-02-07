import { HardhatNetworkConfig, Network } from "hardhat/types";
import { CHAINLINK_ETH_PRICE_DATA_FEEDS } from "../constants/oracles";

export const getChainlinkDataFeedsForNetwork = (network: Network) => {
  // TODO: revisit this
  if (
    network.name == "localhost" ||
    (network.config as HardhatNetworkConfig).forking?.enabled
  ) {
    return CHAINLINK_ETH_PRICE_DATA_FEEDS.MAINNET;
  }

  switch (network.name) {
    case "mainnet":
      return CHAINLINK_ETH_PRICE_DATA_FEEDS.MAINNET;
    default:
      throw new Error(`Unsupported network: ${network.config.chainId}`);
  }
};
