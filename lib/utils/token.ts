import {HardhatNetworkConfig, Network} from "hardhat/types";
import { MAINNET } from "../constants/tokens";

export const getTokenListForNetwork = (network: Network) => {
    if ((network.config as HardhatNetworkConfig).forking?.enabled) {
        return MAINNET;
    }

    switch (network.config.chainId) {
        case 1: return MAINNET;
        default: throw new Error(`Unsupported network: ${network.config.chainId}`);
    }
}
