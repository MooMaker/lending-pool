import {ETH as ETH_ADDRESS, TOKEN_DECIMALS} from '../constants/tokens';
import deployConfigJSON from '../../deploy.config.json';
import {DeployConfig} from "../deploy/types";

const deployConfig = deployConfigJSON as DeployConfig;
export const getReserveAddressFromSymbol = async (symbol: string) => {
    symbol = symbol.toUpperCase();
    if (symbol === 'ETH') {
        return ETH_ADDRESS;
    }

    let address;
    if (symbol in deployConfig) {
        address = deployConfig[symbol];
    }

    if (!address) {
        throw `Could not find address for contract ${symbol}`;
    }

    return address;
};


export const getWhaleAddressForToken = (symbol: string): string => {
    let address = '';

    switch (symbol) {
        case 'USDC':
            address = process.env.USDC_WHALE_ADDRESS || '';
            break;
        case 'DAI':
            address = process.env.DAI_WHALE_ADDRESS || '';
            break;
        default:
            throw `Could not find whale address for token ${symbol}`;
    }

    if (!address) {
        throw `Could not find whale address for token ${symbol}`;
    }

    return address;
}

export const convertToCurrencyDecimals = (currencySymbol: string, amount: string) => {
    let decimals;
    switch (currencySymbol) {
        case 'ETH':
            decimals = TOKEN_DECIMALS.ETH;
            break;
        case 'USDC':
            decimals = TOKEN_DECIMALS.USDC;
            break;
        case 'DAI':
            decimals = TOKEN_DECIMALS.DAI;
            break;
        default:
            throw `Could not find decimals for currency ${currencySymbol}`;
    }

    if (!decimals) {
        throw `Could not find decimals for currency ${currencySymbol}`;
    }

    return BigInt(amount) * BigInt(10 ** decimals);
}
