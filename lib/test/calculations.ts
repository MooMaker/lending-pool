// import BigNumber from 'bignumber.js';
// import {
//   ONE_YEAR,
//   RAY,
//   MAX_UINT_AMOUNT,
//   RATEMODE_NONE,
//   RATEMODE_STABLE,
//   RATEMODE_VARIABLE,
//   OPTIMAL_UTILIZATION_RATE,
//   EXCESS_UTILIZATION_RATE,
//   NIL_ADDRESS,
// } from '../../utils/constants';
// import {IReserveParams, IReservesParams} from '../../utils/types';
// import './math';
// import {ReserveData, UserReserveData} from './interfaces';

// export const strToBN = (amount: string): BigNumber => new BigNumber(amount);

import {ReserveData, UserReserveData} from "../types";
import BigNumber from "bignumber.js";
import {rayDiv} from "../utils/ray-math";

interface Configuration {
  reservesParams: IReservesParams;
  web3: Web3;
  ethereumAddress: string;
}

export const configuration: Configuration = <Configuration>{};

export const calcExpectedUserDataAfterDeposit = (
  amountDeposited: bigint,
  reserveDataBeforeAction: ReserveData,
  reserveDataAfterAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: number,
  currentTimestamp: bigint,
  txCost: bigint
): UserReserveData => {
  const expectedUserData = <UserReserveData>{};

  // expectedUserData.currentBorrowBalance = calcExpectedCompoundedBorrowBalance(
  //   userDataBeforeAction,
  //   reserveDataBeforeAction,
  //   txTimestamp
  // );
  // expectedUserData.principalBorrowBalance = userDataBeforeAction.principalBorrowBalance;
  // expectedUserData.borrowRateMode = userDataBeforeAction.borrowRateMode;
  //
  // if (userDataBeforeAction.borrowRateMode === RATEMODE_NONE) {
  //   expectedUserData.borrowRate = new BigNumber('0');
  // } else {
  //   expectedUserData.borrowRate = userDataBeforeAction.borrowRate;
  // }
  //
  // expectedUserData.liquidityRate = reserveDataAfterAction.liquidityRate;
  //
  // expectedUserData.originationFee = userDataBeforeAction.originationFee;
  //
  // expectedUserData.currentATokenBalance = userDataBeforeAction.currentATokenBalance.plus(
  //   amountDeposited
  // );
  //
  // if (userDataBeforeAction.currentATokenBalance.eq(0)) {
  //   expectedUserData.usageAsCollateralEnabled = true;
  // } else {
  //   //if user is redeeming everything, usageAsCollateralEnabled must be false
  //   if (expectedUserData.currentATokenBalance.eq(0)) {
  //     expectedUserData.usageAsCollateralEnabled = false;
  //   } else {
  //     expectedUserData.usageAsCollateralEnabled = userDataBeforeAction.usageAsCollateralEnabled;
  //   }
  // }
  //
  // expectedUserData.variableBorrowIndex = userDataBeforeAction.variableBorrowIndex;
  //
  // if (reserveDataBeforeAction.address === configuration.ethereumAddress) {
  //   expectedUserData.walletBalance = userDataBeforeAction.walletBalance
  //     .minus(txCost)
  //     .minus(amountDeposited);
  // } else {
  //   expectedUserData.walletBalance = userDataBeforeAction.walletBalance.minus(amountDeposited);
  // }
  //
  // expectedUserData.principalATokenBalance = expectedUserData.currentATokenBalance = calcExpectedATokenBalance(
  //   reserveDataBeforeAction,
  //   userDataBeforeAction,
  //   txTimestamp
  // ).plus(amountDeposited);
  //
  // expectedUserData.redirectedBalance = userDataBeforeAction.redirectedBalance;
  // expectedUserData.interestRedirectionAddress = userDataBeforeAction.interestRedirectionAddress;
  // expectedUserData.currentATokenUserIndex = calcExpectedATokenUserIndex(
  //   reserveDataBeforeAction,
  //   expectedUserData.currentATokenBalance,
  //   expectedUserData.redirectedBalance,
  //   txTimestamp
  // );
  //
  // expectedUserData.redirectionAddressRedirectedBalance = calcExpectedRedirectedBalance(
  //   userDataBeforeAction,
  //   expectedUserData,
  //   userDataBeforeAction.redirectionAddressRedirectedBalance,
  //   new BigNumber(amountDeposited),
  //   new BigNumber(0)
  // );

  return expectedUserData;
};

export const calcExpectedReserveDataAfterDeposit = (
  amountDeposited: bigint,
  reserveDataBeforeAction: ReserveData,
  txTimestamp: number
): ReserveData => {
  const expectedReserveData: ReserveData = <ReserveData>{};

  expectedReserveData.address = reserveDataBeforeAction.address;

  expectedReserveData.totalLiquidity =
      reserveDataBeforeAction.totalLiquidity + amountDeposited;

  expectedReserveData.availableLiquidity =
      reserveDataBeforeAction.availableLiquidity + amountDeposited;

  // expectedReserveData.totalBorrowsStable = reserveDataBeforeAction.totalBorrowsStable;
  expectedReserveData.totalBorrowsVariable = reserveDataBeforeAction.totalBorrowsVariable;
  // expectedReserveData.averageStableBorrowRate = reserveDataBeforeAction.averageStableBorrowRate;

  expectedReserveData.utilizationRate = calcExpectedUtilizationRate(
    // expectedReserveData.totalBorrowsStable,
    expectedReserveData.totalBorrowsVariable,
    expectedReserveData.totalLiquidity
  );
  // const rates = calcExpectedInterestRates(
  //   reserveDataBeforeAction.symbol,
  //   reserveDataBeforeAction.marketStableRate,
  //   expectedReserveData.utilizationRate,
  //   expectedReserveData.totalBorrowsStable,
  //   expectedReserveData.totalBorrowsVariable,
  //   expectedReserveData.averageStableBorrowRate
  // );
  // expectedReserveData.liquidityRate = rates[0];
  // expectedReserveData.stableBorrowRate = rates[1];
  // expectedReserveData.variableBorrowRate = rates[2];
  //
  // expectedReserveData.averageStableBorrowRate = reserveDataBeforeAction.averageStableBorrowRate;
  // expectedReserveData.liquidityIndex = calcExpectedLiquidityIndex(
  //   reserveDataBeforeAction,
  //   txTimestamp
  // );
  // expectedReserveData.variableBorrowIndex = calcExpectedVariableBorrowIndex(
  //   reserveDataBeforeAction,
  //   txTimestamp
  // );

  return expectedReserveData;
};

const calcExpectedUtilizationRate = (
    totalBorrowsVariable: bigint,
    totalLiquidity: bigint
): BigNumber => {
  if (totalBorrowsVariable == 0n) {
    return new BigNumber(0);
  }

  return rayDiv(totalBorrowsVariable.toString(), totalLiquidity.toString());
};
