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
import {RAY, rayDiv, rayMul, rayPow, wadToRay} from "../utils/ray-math";
import {EXCESS_UTILIZATION_RATE, InterestRateStrategy, OPTIMAL_UTILIZATION_RATE} from "../constants/reserves";
import {SECONDS_PER_YEAR} from "../constants/common";

interface CalcConfig {
  reservesParams: Map<string, InterestRateStrategy>;
  ethereumAddress: string;
}

let _config= <CalcConfig>{};

export const setConfig = (config: CalcConfig) => {
  _config = config;
}

export const getConfig = () => {
  return _config;
}

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

const calcExpectedInterestRates = (
    reserveSymbol: string,
    utilizationRate: BigNumber,
): { liquidityRate: BigNumber, variableBorrowRate: BigNumber } => {
  const {reservesParams} = _config;

  const reserveConfiguration = reservesParams.get(reserveSymbol);

  if (!reserveConfiguration) {
    throw `Reserve configuration for ${reserveSymbol} not found`;
  }

  let variableBorrowRate = reserveConfiguration.baseVariableBorrowRate;

  if (utilizationRate.gt(OPTIMAL_UTILIZATION_RATE)) {
    const excessUtilizationRateRatio = rayDiv(
        utilizationRate.minus(OPTIMAL_UTILIZATION_RATE),
        EXCESS_UTILIZATION_RATE
    );

    variableBorrowRate = variableBorrowRate
        .plus(reserveConfiguration.variableRateSlope1)
        .plus(
            rayMul(
                reserveConfiguration.variableRateSlope2,
                excessUtilizationRateRatio
            )
        );
  } else {
    variableBorrowRate = variableBorrowRate.plus(
        rayMul(
            rayDiv(utilizationRate, OPTIMAL_UTILIZATION_RATE),
            reserveConfiguration.variableRateSlope1
        )
    );
  }

  const liquidityRate =
      rayMul(
          variableBorrowRate,
          utilizationRate
      );

  return {
    liquidityRate,
    variableBorrowRate
  };
};

export const calcExpectedReserveDataAfterDeposit = (
  amountDeposited: bigint,
  reserveDataBeforeAction: ReserveData,
  txTimestamp: bigint
): ReserveData => {
  const expectedReserveData: ReserveData = <ReserveData>{};

  expectedReserveData.address = reserveDataBeforeAction.address;

  expectedReserveData.totalLiquidity =
      reserveDataBeforeAction.totalLiquidity + amountDeposited;

  expectedReserveData.availableLiquidity =
      reserveDataBeforeAction.availableLiquidity + amountDeposited;

  expectedReserveData.totalBorrowsVariable = reserveDataBeforeAction.totalBorrowsVariable;

  expectedReserveData.utilizationRate = calcExpectedUtilizationRate(
    expectedReserveData.totalBorrowsVariable,
    expectedReserveData.totalLiquidity
  );

  const { liquidityRate, variableBorrowRate } = calcExpectedInterestRates(
    reserveDataBeforeAction.symbol,
    expectedReserveData.utilizationRate,
  );
  expectedReserveData.liquidityRate = liquidityRate;
  expectedReserveData.variableBorrowRate = variableBorrowRate;

  expectedReserveData.liquidityIndex = calcExpectedLiquidityIndex(
    reserveDataBeforeAction,
    txTimestamp
  );

  expectedReserveData.variableBorrowIndex = calcExpectedVariableBorrowIndex(
    reserveDataBeforeAction,
    txTimestamp
  );

  return expectedReserveData;
};

const calcExpectedVariableBorrowIndex = (reserveData: ReserveData, timestamp: bigint) => {
  //if utilization rate is 0, nothing to compound
  if (reserveData.utilizationRate.eq('0')) {
    return reserveData.variableBorrowIndex;
  }

  const cumulatedInterest = calcCompoundedInterest(
      reserveData.variableBorrowRate,
      timestamp,
      reserveData.lastUpdateTimestamp
  );

  return rayMul(
      cumulatedInterest,
      reserveData.variableBorrowIndex
  );
};

const calcCompoundedInterest = (
    rate: BigNumber,
    currentTimestamp: bigint,
    lastUpdateTimestamp: bigint
) => {
  const timeDifference = currentTimestamp - lastUpdateTimestamp;

  const ratePerSecond = rate.div(SECONDS_PER_YEAR);

  const compoundedInterest =
      rayPow(
          ratePerSecond.plus(RAY),
          new BigNumber(timeDifference.toString())
      )

  return compoundedInterest;
};

const calcExpectedLiquidityIndex = (reserveData: ReserveData, timestamp: bigint) => {
  //if utilization rate is 0, nothing to compound
  if (reserveData.utilizationRate.eq('0')) {
    return reserveData.liquidityIndex;
  }

  const cumulatedInterest = calcLinearInterest(
      reserveData.liquidityRate,
      timestamp,
      reserveData.lastUpdateTimestamp
  );

  return rayMul(
      cumulatedInterest,
      reserveData.liquidityIndex
  );
};

const calcLinearInterest = (
    rate: BigNumber,
    currentTimestamp: bigint,
    lastUpdateTimestamp: bigint
) => {
  const timeDifference =  wadToRay(new BigNumber((currentTimestamp - lastUpdateTimestamp).toString()));

  const timeDelta = rayDiv(
      timeDifference,
      wadToRay(new BigNumber(SECONDS_PER_YEAR).toString())
  )

  const cumulatedInterest = rayMul(
      rate,
      timeDelta
  ).plus(RAY);

  return cumulatedInterest;
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
