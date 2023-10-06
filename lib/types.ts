import BigNumber from "bignumber.js";

export interface ReserveData {
    address: string
    symbol: string
    decimals: bigint
    totalLiquidity: bigint
    availableLiquidity: bigint
    // totalBorrowsStable: bigint
    totalBorrowsVariable: bigint
    // averageStableBorrowRate: bigint
    variableBorrowRate: BigNumber
    // stableBorrowRate: bigint
    utilizationRate: BigNumber
    liquidityIndex: BigNumber
    variableBorrowIndex: BigNumber
    aTokenAddress: string
    // marketStableRate: bigint
    lastUpdateTimestamp: bigint
    liquidityRate: BigNumber
    [key: string]: bigint | string | BigNumber
}

export interface UserReserveData {
    principalATokenBalance: bigint
    currentATokenBalance: bigint
    currentATokenUserIndex: bigint
    // interestRedirectionAddress: string
    // redirectionAddressRedirectedBalance: bigint
    // redirectedBalance: bigint
    principalBorrowBalance: bigint
    borrowRateMode: string
    borrowRate: bigint
    liquidityRate: bigint
    originationFee: bigint
    variableBorrowIndex: bigint
    lastUpdateTimestamp: bigint
    // usageAsCollateralEnabled: Boolean
    walletBalance: bigint
    currentBorrowBalance: bigint
    [key: string]: bigint | string | Boolean
}
