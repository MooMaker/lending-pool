import {HardhatNetworkConfig, Network} from "hardhat/types";
import { MAINNET_ADDRESSES } from "../constants/tokens";

export const getTokenListForNetwork = (network: Network) => {
    // TODO: revisit this
    if (network.name == 'localhost' || (network.config as HardhatNetworkConfig).forking?.enabled) {
        return MAINNET_ADDRESSES;
    }

    switch (network.config.chainId) {
        case 1: return MAINNET_ADDRESSES;
        default: throw new Error(`Unsupported network: ${network.config.chainId}`);
    }
}
