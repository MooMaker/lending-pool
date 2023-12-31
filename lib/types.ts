import BigNumber from "bignumber.js";

export type ReserveData = {
  address: string;
  symbol: string;
  decimals: bigint;
  totalLiquidity: bigint;
  availableLiquidity: bigint;
  // totalBorrowsStable: bigint
  totalBorrowsVariable: bigint;
  // averageStableBorrowRate: bigint
  variableBorrowRate: BigNumber;
  // stableBorrowRate: bigint
  utilizationRate: BigNumber;
  liquidityIndex: BigNumber;
  variableBorrowIndex: BigNumber;
  aTokenAddress: string;
  // marketStableRate: bigint
  lastUpdateTimestamp: bigint;
  liquidityRate: BigNumber;
  [key: string]: bigint | string | BigNumber;
};

export type UserReserveData = {
  principalATokenBalance: bigint;
  currentATokenBalance: bigint;
  currentATokenUserIndex: BigNumber;
  principalBorrowBalance: bigint;
  borrowRate: BigNumber;
  liquidityRate: BigNumber;
  originationFee: bigint;
  variableBorrowIndex: BigNumber;
  lastUpdateTimestamp: bigint;
  usageAsCollateralEnabled: boolean;
  walletBalance: bigint;
  currentBorrowBalance: bigint;
  [key: string]: bigint | string | boolean | BigNumber;
};
