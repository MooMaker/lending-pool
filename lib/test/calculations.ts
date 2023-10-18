import { ReserveData, UserReserveData } from "../types";
import BigNumber from "bignumber.js";
import {
  RAY,
  rayDiv,
  rayMul,
  rayPow,
  rayToWad,
  wadToRay,
} from "../utils/ray-math";
import {
  EXCESS_UTILIZATION_RATE,
  InterestRateStrategy,
  OPTIMAL_UTILIZATION_RATE,
} from "../constants/reserves";
import { SECONDS_PER_YEAR } from "../constants/common";
import { BigNumberZD } from "../utils/bignumber";

type CalcConfig = {
  reservesParams: Map<string, InterestRateStrategy>;
  ethereumAddress: string;
}

let _config = <CalcConfig>{};

export const setConfig = (config: CalcConfig) => {
  _config = config;
};

export const getConfig = () => {
  return _config;
};

export const calcExpectedUserDataAfterDeposit = (
  amountDeposited: bigint,
  reserveDataBeforeAction: ReserveData,
  reserveDataAfterAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: bigint,
  currentTimestamp: bigint,
  txCost: bigint,
): UserReserveData => {
  const expectedUserData = <UserReserveData>{};

  expectedUserData.currentBorrowBalance = calcExpectedCompoundedBorrowBalance(
    userDataBeforeAction,
    reserveDataBeforeAction,
    txTimestamp,
  );

  expectedUserData.principalBorrowBalance =
    userDataBeforeAction.principalBorrowBalance;

  expectedUserData.borrowRate = userDataBeforeAction.borrowRate;
  expectedUserData.liquidityRate = reserveDataAfterAction.liquidityRate;

  expectedUserData.originationFee = userDataBeforeAction.originationFee;

  expectedUserData.currentATokenBalance =
    userDataBeforeAction.currentATokenBalance + amountDeposited;

  // TODO(usageAsCollateralEnabled) restore
  // if (userDataBeforeAction.currentATokenBalance === 0n) {
  //   expectedUserData.usageAsCollateralEnabled = true;
  // } else {
  //   //if user is redeeming everything, usageAsCollateralEnabled must be false
  //   if (expectedUserData.currentATokenBalance === 0n) {
  //     expectedUserData.usageAsCollateralEnabled = false;
  //   } else {
  //     expectedUserData.usageAsCollateralEnabled = userDataBeforeAction.usageAsCollateralEnabled;
  //   }
  // }

  expectedUserData.variableBorrowIndex =
    userDataBeforeAction.variableBorrowIndex;

  if (reserveDataBeforeAction.address === _config.ethereumAddress) {
    expectedUserData.walletBalance =
      userDataBeforeAction.walletBalance - txCost - amountDeposited;
  } else {
    expectedUserData.walletBalance =
      userDataBeforeAction.walletBalance - amountDeposited;
  }

  expectedUserData.principalATokenBalance =
    expectedUserData.currentATokenBalance =
      calcExpectedATokenBalance(
        reserveDataBeforeAction,
        userDataBeforeAction,
        txTimestamp,
      ) + amountDeposited;

  expectedUserData.currentATokenUserIndex = calcExpectedATokenUserIndex(
    reserveDataBeforeAction,
    expectedUserData.currentATokenBalance,
    txTimestamp,
  );

  return expectedUserData;
};

const calcExpectedATokenUserIndex = (
  reserveDataBeforeAction: ReserveData,
  expectedUserBalanceAfterAction: bigint,
  currentTimestamp: bigint,
) => {
  if (expectedUserBalanceAfterAction === 0n) {
    return new BigNumberZD(0);
  }

  const result = calcExpectedReserveNormalizedIncome(
    reserveDataBeforeAction,
    currentTimestamp,
  );
  return BigNumberZD(result);
};

const calcExpectedATokenBalance = (
  reserveDataBeforeAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  currentTimestamp: bigint,
): bigint => {
  const income = calcExpectedReserveNormalizedIncome(
    reserveDataBeforeAction,
    currentTimestamp,
  );

  const {
    currentATokenUserIndex: userIndexBeforeAction,
    principalATokenBalance: principalBalanceBeforeAction,
  } = userDataBeforeAction;

  if (userIndexBeforeAction.eq("0")) {
    return principalBalanceBeforeAction;
  }

  const balanceWithIncome = rayMul(
    wadToRay(principalBalanceBeforeAction.toString()),
    income,
  );

  let result = rayDiv(balanceWithIncome, userIndexBeforeAction);

  result = rayToWad(result);

  return BigInt(result.toString(10));
};

const calcExpectedReserveNormalizedIncome = (
  reserveData: ReserveData,
  currentTimestamp: bigint,
) => {
  const { liquidityRate, liquidityIndex, lastUpdateTimestamp } = reserveData;

  //if utilization rate is 0, nothing to compound
  if (liquidityRate.eq("0")) {
    return liquidityIndex;
  }

  const cumulatedInterest = calcLinearInterest(
    liquidityRate,
    currentTimestamp,
    lastUpdateTimestamp,
  );

  const income = rayMul(cumulatedInterest, liquidityIndex);

  return income;
};

const calcExpectedCompoundedBorrowBalance = (
  userData: UserReserveData,
  reserveData: ReserveData,
  timestamp: bigint,
): bigint => {
  if (userData.principalBorrowBalance === 0n) {
    return 0n;
  }

  const cumulatedInterest = calcCompoundedInterest(
    userData.borrowRate,
    timestamp,
    userData.lastUpdateTimestamp,
  );

  const borrowBalanceRay = wadToRay(
    new BigNumber(userData.principalBorrowBalance.toString()),
  );

  const cumulatedInterestVariable = rayDiv(
    rayMul(cumulatedInterest, reserveData.variableBorrowIndex),
    userData.variableBorrowIndex,
  );

  const value = rayToWad(rayMul(borrowBalanceRay, cumulatedInterestVariable));

  return BigInt(value.toString(10));
};

const calcExpectedInterestRates = (
  reserveSymbol: string,
  utilizationRate: BigNumber,
): { liquidityRate: BigNumber; variableBorrowRate: BigNumber } => {
  const { reservesParams } = _config;

  const reserveConfiguration = reservesParams.get(reserveSymbol);

  if (!reserveConfiguration) {
    throw `Reserve configuration for ${reserveSymbol} not found`;
  }

  let variableBorrowRate = reserveConfiguration.baseVariableBorrowRate;

  if (utilizationRate.gt(OPTIMAL_UTILIZATION_RATE)) {
    const excessUtilizationRateRatio = rayDiv(
      utilizationRate.minus(OPTIMAL_UTILIZATION_RATE),
      EXCESS_UTILIZATION_RATE,
    );

    variableBorrowRate = variableBorrowRate
      .plus(reserveConfiguration.variableRateSlope1)
      .plus(
        rayMul(
          reserveConfiguration.variableRateSlope2,
          excessUtilizationRateRatio,
        ),
      );
  } else {
    variableBorrowRate = variableBorrowRate.plus(
      rayMul(
        rayDiv(utilizationRate, OPTIMAL_UTILIZATION_RATE),
        reserveConfiguration.variableRateSlope1,
      ),
    );
  }

  const liquidityRate = rayMul(variableBorrowRate, utilizationRate);

  return {
    liquidityRate,
    variableBorrowRate,
  };
};

export const calcExpectedReserveDataAfterDeposit = (
  amountDeposited: bigint,
  reserveDataBeforeAction: ReserveData,
  txTimestamp: bigint,
): ReserveData => {
  const expectedReserveData: ReserveData = <ReserveData>{};

  expectedReserveData.address = reserveDataBeforeAction.address;

  expectedReserveData.totalLiquidity =
    reserveDataBeforeAction.totalLiquidity + amountDeposited;

  expectedReserveData.availableLiquidity =
    reserveDataBeforeAction.availableLiquidity + amountDeposited;

  expectedReserveData.totalBorrowsVariable =
    reserveDataBeforeAction.totalBorrowsVariable;

  expectedReserveData.utilizationRate = calcExpectedUtilizationRate(
    expectedReserveData.totalBorrowsVariable,
    expectedReserveData.totalLiquidity,
  );

  const { liquidityRate, variableBorrowRate } = calcExpectedInterestRates(
    reserveDataBeforeAction.symbol,
    expectedReserveData.utilizationRate,
  );
  expectedReserveData.liquidityRate = liquidityRate;
  expectedReserveData.variableBorrowRate = variableBorrowRate;

  expectedReserveData.liquidityIndex = calcExpectedLiquidityIndex(
    reserveDataBeforeAction,
    txTimestamp,
  );

  expectedReserveData.variableBorrowIndex = calcExpectedVariableBorrowIndex(
    reserveDataBeforeAction,
    txTimestamp,
  );

  return expectedReserveData;
};

const calcExpectedVariableBorrowIndex = (
  reserveData: ReserveData,
  timestamp: bigint,
) => {
  //if utilization rate is 0, nothing to compound
  if (reserveData.utilizationRate.eq("0")) {
    return reserveData.variableBorrowIndex;
  }

  const cumulatedInterest = calcCompoundedInterest(
    reserveData.variableBorrowRate,
    timestamp,
    reserveData.lastUpdateTimestamp,
  );

  return rayMul(cumulatedInterest, reserveData.variableBorrowIndex);
};

const calcCompoundedInterest = (
  rate: BigNumber,
  currentTimestamp: bigint,
  lastUpdateTimestamp: bigint,
) => {
  const timeDifference = currentTimestamp - lastUpdateTimestamp;

  const ratePerSecond = rate.div(SECONDS_PER_YEAR);

  const compoundedInterest = rayPow(
    ratePerSecond.plus(RAY),
    new BigNumber(timeDifference.toString()),
  );

  return compoundedInterest;
};

const calcExpectedLiquidityIndex = (
  reserveData: ReserveData,
  timestamp: bigint,
) => {
  //if utilization rate is 0, nothing to compound
  if (reserveData.utilizationRate.eq("0")) {
    return reserveData.liquidityIndex;
  }

  const cumulatedInterest = calcLinearInterest(
    reserveData.liquidityRate,
    timestamp,
    reserveData.lastUpdateTimestamp,
  );

  return rayMul(cumulatedInterest, reserveData.liquidityIndex);
};

const calcLinearInterest = (
  rate: BigNumber,
  currentTimestamp: bigint,
  lastUpdateTimestamp: bigint,
) => {
  const timeDifference = wadToRay(
    new BigNumber((currentTimestamp - lastUpdateTimestamp).toString()),
  );

  const timeDelta = rayDiv(
    timeDifference,
    wadToRay(new BigNumber(SECONDS_PER_YEAR).toString()),
  );

  const cumulatedInterest = rayMul(rate, timeDelta).plus(RAY);

  return cumulatedInterest;
};

const calcExpectedUtilizationRate = (
  totalBorrowsVariable: bigint,
  totalLiquidity: bigint,
): BigNumber => {
  if (totalBorrowsVariable == 0n) {
    return new BigNumber(0);
  }

  return rayDiv(totalBorrowsVariable.toString(), totalLiquidity.toString());
};
