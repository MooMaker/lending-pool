import hre from "hardhat";
import {ETH, ETH as ETH_ADDRESS, TOKEN_DECIMALS} from '../constants/tokens';
import deployConfigJSON from '../../deploy.config.json';
import {DeployConfig} from "../deploy/types";
import {ReserveData, UserReserveData} from "../types";
import {LendingPool, LendingPoolCore} from "../../typechain-types";
import {getEnvironment} from "./scenarios/common";
import BigNumber from "bignumber.js";
import {getConfig} from "./scenarios/actions";
import {BigNumberZD} from "../utils/bignumber";

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
            decimals = TOKEN_DECIMALS.get('ETH');
            break;
        case 'USDC':
            decimals = TOKEN_DECIMALS.get('USDC');
            break;
        case 'DAI':
            decimals = TOKEN_DECIMALS.get('DAI');
            break;
        default:
            throw `Could not find decimals for currency ${currencySymbol}`;
    }

    if (!decimals) {
        throw `Could not find decimals for currency ${currencySymbol}`;
    }

    return BigInt(amount) * BigInt(10 ** decimals);
}

export const getReserveData = async (
    poolInstance: LendingPool,
    reserve: string,
): Promise<ReserveData> => {
    const data: any = await poolInstance.getReserveData(reserve);

    const isEthReserve = reserve === ETH_ADDRESS;
    let symbol = 'ETH';
    let decimals = BigInt(18);
    if (!isEthReserve) {
        const { tokensPerAddress } = await getEnvironment();

        const token = tokensPerAddress.get(reserve);

        if (!token) {
            throw `Could not find token for reserve ${reserve}`;
        }

        symbol = await token.symbol();
        decimals = await token.decimals();
    }

    // TODO: probably all of them must be instances of BigNumberZD
    return {
        totalLiquidity: data.totalLiquidity,
        availableLiquidity: data.availableLiquidity,
        totalBorrowsVariable: data.totalBorrowsVariable,
        liquidityRate: new BigNumberZD(data.liquidityRate.toString()),
        variableBorrowRate: new BigNumber(data.variableBorrowRate.toString()),
        utilizationRate: new BigNumber(data.utilizationRate.toString()),
        liquidityIndex: new BigNumber(data.liquidityIndex),
        variableBorrowIndex: new BigNumber(data.variableBorrowIndex),
        lastUpdateTimestamp: data.lastUpdateTimestamp,
        address: reserve,
        aTokenAddress: data.aTokenAddress,
        symbol,
        decimals,
    };
};

export const getUserData = async (
    poolInstance: LendingPool,
    coreInstance: LendingPoolCore,
    reserve: string,
    user: string,
): Promise<UserReserveData> => {
    const [data, aTokenData] = await Promise.all([
        poolInstance.getUserReserveData(reserve, user),
        getATokenUserData(reserve, user, coreInstance),
    ]);

    const [
        userIndex,
        // redirectedBalance,
        principalATokenBalance,
        // redirectionAddressRedirectedBalance,
        // interestRedirectionAddress,
    ] = aTokenData;

    let walletBalance;

    if (reserve === ETH) {
        walletBalance = await hre.ethers.provider.getBalance(user)
    } else {
        const { tokensPerAddress } = await getEnvironment();

        const reserveInstance = tokensPerAddress.get(reserve);
        if (!reserveInstance) {
            throw `Could not find token for reserve ${reserve}`;
        }

        walletBalance = await reserveInstance.balanceOf(user);
    }

    const userData : any = data

    return {
        principalATokenBalance,
        // interestRedirectionAddress,
        // redirectionAddressRedirectedBalance: new BigNumber(redirectionAddressRedirectedBalance),
        // redirectedBalance: new BigNumber(redirectedBalance),
        currentATokenUserIndex: userIndex,
        currentATokenBalance: userData.currentATokenBalance,
        currentBorrowBalance: userData.currentBorrowBalance,
        principalBorrowBalance: userData.principalBorrowBalance,
        borrowRateMode: userData.borrowRateMode.toString(),
        borrowRate: userData.borrowRate,
        liquidityRate: userData.liquidityRate,
        originationFee: userData.originationFee,
        variableBorrowIndex: userData.variableBorrowIndex,
        lastUpdateTimestamp: userData.lastUpdateTimestamp,
        // usageAsCollateralEnabled: userData.usageAsCollateralEnabled,
        walletBalance,
    };
};

const getATokenUserData = async (
    reserve: string,
    user: string,
    coreInstance: LendingPoolCore,
) => {
    const aTokenAddress: string = await coreInstance.getReserveATokenAddress(reserve);

    const { aTokensPerAddress } = getConfig().contracts;
    const aTokenInstance = aTokensPerAddress.get(aTokenAddress);

    if (!aTokenInstance) {
        throw `Could not find aToken instance for ${aTokenAddress}`;
    }

    const [
        userIndex,
        // interestRedirectionAddress,
        // redirectedBalance,
        principalTokenBalance,
    ] = await Promise.all([
        aTokenInstance.getUserIndex(user),
        aTokenInstance.principalBalanceOf(user),
    ]);

    // TODO(redirects): do we need it?
    // const redirectionAddressRedirectedBalance =
    //     interestRedirectionAddress !== NIL_ADDRESS
    //         ? new BigNumber(await aTokenInstance.getRedirectedBalance(interestRedirectionAddress))
    //         : new BigNumber('0');

    return [
        userIndex,
        // redirectedBalance.toString(),
        principalTokenBalance,
        // redirectionAddressRedirectedBalance.toString(),
        // interestRedirectionAddress,
    ];
};
