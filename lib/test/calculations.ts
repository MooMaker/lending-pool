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
import {
  MAX_UINT_VALUE,
  NIL_ADDRESS,
  SECONDS_PER_YEAR,
} from "../constants/common";
import { BigNumberZD } from "../utils/bignumber";

type CalcConfig = {
  reservesParams: Map<string, InterestRateStrategy>;
  ethereumAddress: string;
};

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

  if (userDataBeforeAction.currentATokenBalance === 0n) {
    expectedUserData.usageAsCollateralEnabled = true;
  } else {
    //if user is redeeming everything, usageAsCollateralEnabled must be false
    if (expectedUserData.currentATokenBalance === 0n) {
      expectedUserData.usageAsCollateralEnabled = false;
    } else {
      expectedUserData.usageAsCollateralEnabled =
        userDataBeforeAction.usageAsCollateralEnabled;
    }
  }

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

export const calcExpectedReserveDataAfterBorrow = (
  amountBorrowed: bigint,
  reserveDataBeforeAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: bigint,
): ReserveData => {
  const expectedReserveData = <ReserveData>{};

  expectedReserveData.address = reserveDataBeforeAction.address;

  let userBalanceIncrease = 0n;
  let userCurrentBorrowBalance = 0n;

  if (userDataBeforeAction.currentBorrowBalance > 0n) {
    //if the user performing the action had already a borrow, we need to compound the balance until the action

    userCurrentBorrowBalance = calcExpectedCompoundedBorrowBalance(
      userDataBeforeAction,
      reserveDataBeforeAction,
      txTimestamp,
    );

    userBalanceIncrease =
      userCurrentBorrowBalance - userDataBeforeAction.principalBorrowBalance;

    expectedReserveData.totalLiquidity =
      reserveDataBeforeAction.totalLiquidity + userBalanceIncrease;
  } else {
    expectedReserveData.totalLiquidity = reserveDataBeforeAction.totalLiquidity;
  }

  expectedReserveData.availableLiquidity =
    reserveDataBeforeAction.availableLiquidity - amountBorrowed;

  expectedReserveData.totalBorrowsVariable =
    reserveDataBeforeAction.totalBorrowsVariable -
    userDataBeforeAction.principalBorrowBalance;

  expectedReserveData.totalBorrowsVariable =
    expectedReserveData.totalBorrowsVariable +
    userDataBeforeAction.principalBorrowBalance +
    userBalanceIncrease +
    amountBorrowed;

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

export const calcExpectedReserveDataAfterRepay = (
  amountRepaid: bigint,
  reserveDataBeforeAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: bigint,
): ReserveData => {
  const expectedReserveData: ReserveData = <ReserveData>{};

  expectedReserveData.address = reserveDataBeforeAction.address;

  const userCurrentBorrowBalance = calcExpectedCompoundedBorrowBalance(
    userDataBeforeAction,
    reserveDataBeforeAction,
    txTimestamp,
  );

  const userBalanceIncrease =
    userCurrentBorrowBalance - userDataBeforeAction.principalBorrowBalance;

  expectedReserveData.totalLiquidity =
    reserveDataBeforeAction.totalLiquidity + userBalanceIncrease;

  //if amount repaid = MAX_UINT_AMOUNT, user is repaying everything
  if (amountRepaid == MAX_UINT_VALUE) {
    amountRepaid = userCurrentBorrowBalance;
  } else {
    amountRepaid =
      userDataBeforeAction.originationFee > amountRepaid
        ? 0n
        : amountRepaid - userDataBeforeAction.originationFee;
  }

  if (amountRepaid === 0n) {
    //user is only repaying part or all the utilization fee
    expectedReserveData.availableLiquidity =
      reserveDataBeforeAction.availableLiquidity;
  } else {
    expectedReserveData.availableLiquidity =
      reserveDataBeforeAction.availableLiquidity + amountRepaid;
  }

  expectedReserveData.totalBorrowsVariable =
    reserveDataBeforeAction.totalBorrowsVariable +
    userBalanceIncrease -
    amountRepaid;
  expectedReserveData.totalBorrowsStable =
    reserveDataBeforeAction.totalBorrowsStable;
  expectedReserveData.averageStableBorrowRate =
    reserveDataBeforeAction.averageStableBorrowRate;

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

export const calcExpectedReserveDataAfterRedeem = (
  amountRedeemed: bigint,
  reserveDataBeforeAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: bigint,
): ReserveData => {
  const expectedReserveData: ReserveData = <ReserveData>{};

  expectedReserveData.address = reserveDataBeforeAction.address;

  if (amountRedeemed == MAX_UINT_VALUE) {
    amountRedeemed = calcExpectedATokenBalance(
      reserveDataBeforeAction,
      userDataBeforeAction,
      txTimestamp,
    );
  }

  expectedReserveData.totalLiquidity =
    reserveDataBeforeAction.totalLiquidity - amountRedeemed;
  expectedReserveData.availableLiquidity =
    reserveDataBeforeAction.availableLiquidity - amountRedeemed;

  expectedReserveData.totalBorrowsStable =
    reserveDataBeforeAction.totalBorrowsStable;
  expectedReserveData.totalBorrowsVariable =
    reserveDataBeforeAction.totalBorrowsVariable;
  expectedReserveData.averageStableBorrowRate =
    reserveDataBeforeAction.averageStableBorrowRate;

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

  expectedReserveData.averageStableBorrowRate =
    reserveDataBeforeAction.averageStableBorrowRate;
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

export const calcExpectedUserDataAfterBorrow = (
  amountBorrowed: bigint,
  reserveDataBeforeAction: ReserveData,
  expectedDataAfterAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: bigint,
  currentTimestamp: bigint,
  txCost: bigint,
): UserReserveData => {
  const expectedUserData = <UserReserveData>{};

  const originationFee = calcExpectedOriginationFee(amountBorrowed);

  const borrowBalanceBeforeTx = calcExpectedCompoundedBorrowBalance(
    userDataBeforeAction,
    reserveDataBeforeAction,
    txTimestamp,
  );

  expectedUserData.principalBorrowBalance =
    borrowBalanceBeforeTx + amountBorrowed;

  if (currentTimestamp > txTimestamp) {
    //calculate also the accrued balance after the time passed
    const borrowBalanceAfterTx = calcExpectedCompoundedBorrowBalance(
      {
        ...userDataBeforeAction,
        borrowRate: expectedDataAfterAction.variableBorrowRate,
        principalBorrowBalance: borrowBalanceBeforeTx + amountBorrowed,
        variableBorrowIndex: expectedDataAfterAction.variableBorrowIndex,
        lastUpdateTimestamp: txTimestamp,
      },
      reserveDataBeforeAction,
      currentTimestamp,
    );

    expectedUserData.currentBorrowBalance = borrowBalanceAfterTx;
  } else {
    expectedUserData.currentBorrowBalance =
      expectedUserData.principalBorrowBalance;
  }

  expectedUserData.borrowRate = expectedDataAfterAction.variableBorrowRate;
  expectedUserData.variableBorrowIndex =
    expectedDataAfterAction.variableBorrowIndex;

  expectedUserData.liquidityRate = expectedDataAfterAction.liquidityRate;

  expectedUserData.originationFee =
    userDataBeforeAction.originationFee + originationFee;

  expectedUserData.usageAsCollateralEnabled =
    userDataBeforeAction.usageAsCollateralEnabled;

  expectedUserData.currentATokenBalance = calcExpectedATokenBalance(
    reserveDataBeforeAction,
    userDataBeforeAction,
    txTimestamp,
  );
  expectedUserData.principalATokenBalance =
    userDataBeforeAction.principalATokenBalance;
  // TODO: handle redirects?
  // expectedUserData.redirectedBalance = userDataBeforeAction.redirectedBalance;
  // expectedUserData.interestRedirectionAddress = userDataBeforeAction.interestRedirectionAddress;
  // expectedUserData.redirectionAddressRedirectedBalance =
  //   userDataBeforeAction.redirectionAddressRedirectedBalance;
  expectedUserData.currentATokenUserIndex = calcExpectedATokenUserIndex(
    reserveDataBeforeAction,
    expectedUserData.currentATokenBalance,
    // expectedUserData.redirectedBalance,
    txTimestamp,
  );

  if (reserveDataBeforeAction.address === _config.ethereumAddress) {
    expectedUserData.walletBalance =
      userDataBeforeAction.walletBalance - txCost + amountBorrowed;
  } else {
    expectedUserData.walletBalance =
      userDataBeforeAction.walletBalance + amountBorrowed;
  }

  return expectedUserData;
};

export const calcExpectedUserDataAfterRedeem = (
  amountRedeemed: bigint,
  reserveDataBeforeAction: ReserveData,
  reserveDataAfterAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txTimestamp: bigint,
  currentTimestamp: bigint,
  txCost: bigint,
): UserReserveData => {
  const expectedUserData = <UserReserveData>{};

  const aTokenBalance = calcExpectedATokenBalance(
    reserveDataBeforeAction,
    userDataBeforeAction,
    txTimestamp,
  );

  if (amountRedeemed == MAX_UINT_VALUE) {
    amountRedeemed = aTokenBalance;
  }
  expectedUserData.principalATokenBalance =
    expectedUserData.currentATokenBalance = aTokenBalance - amountRedeemed;
  expectedUserData.currentBorrowBalance = calcExpectedCompoundedBorrowBalance(
    userDataBeforeAction,
    reserveDataBeforeAction,
    txTimestamp,
  );
  expectedUserData.principalBorrowBalance =
    userDataBeforeAction.principalBorrowBalance;
  expectedUserData.borrowRateMode = userDataBeforeAction.borrowRateMode;

  expectedUserData.borrowRateMode = userDataBeforeAction.borrowRateMode;

  // TODO: handle none
  // if (userDataBeforeAction.borrowRateMode === RATEMODE_NONE) {
  //   expectedUserData.borrowRate = new BigNumber("0");
  // } else {
  expectedUserData.borrowRate = userDataBeforeAction.borrowRate;
  // }

  expectedUserData.liquidityRate = reserveDataAfterAction.liquidityRate;

  expectedUserData.originationFee = userDataBeforeAction.originationFee;

  if (userDataBeforeAction.currentATokenBalance === 0n) {
    expectedUserData.usageAsCollateralEnabled = true;
  } else {
    //if user is redeeming everything, usageAsCollateralEnabled must be false
    if (expectedUserData.currentATokenBalance === 0n) {
      expectedUserData.usageAsCollateralEnabled = false;
    } else {
      expectedUserData.usageAsCollateralEnabled =
        userDataBeforeAction.usageAsCollateralEnabled;
    }
  }

  expectedUserData.variableBorrowIndex =
    userDataBeforeAction.variableBorrowIndex;

  if (reserveDataBeforeAction.address === _config.ethereumAddress) {
    expectedUserData.walletBalance =
      userDataBeforeAction.walletBalance - txCost + amountRedeemed;
  } else {
    expectedUserData.walletBalance =
      userDataBeforeAction.walletBalance + amountRedeemed;
  }

  expectedUserData.redirectedBalance = userDataBeforeAction.redirectedBalance;

  if (
    expectedUserData.currentATokenBalance === 0n &&
    expectedUserData.redirectedBalance === 0n
  ) {
    expectedUserData.interestRedirectionAddress = NIL_ADDRESS;
  } else {
    expectedUserData.interestRedirectionAddress =
      userDataBeforeAction.interestRedirectionAddress;
  }
  expectedUserData.currentATokenUserIndex = calcExpectedATokenUserIndex(
    reserveDataBeforeAction,
    expectedUserData.currentATokenBalance,
    // TODO: handle redirects?
    // expectedUserData.redirectedBalance,
    txTimestamp,
  );

  // TODO: handle redirects?
  // expectedUserData.redirectionAddressRedirectedBalance =
  //   calcExpectedRedirectedBalance(
  //     userDataBeforeAction,
  //     expectedUserData,
  //     userDataBeforeAction.redirectionAddressRedirectedBalance,
  //     new BigNumber(0),
  //     new BigNumber(amountRedeemed),
  //   );

  return expectedUserData;
};

export const calcExpectedUserDataAfterRepay = (
  totalRepaid: bigint,
  reserveDataBeforeAction: ReserveData,
  expectedDataAfterAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  user: string,
  onBehalfOf: string,
  txTimestamp: bigint,
  txCost: bigint,
): UserReserveData => {
  const expectedUserData = <UserReserveData>{};

  const userCurrentBorrowBalance = calcExpectedCompoundedBorrowBalance(
    userDataBeforeAction,
    reserveDataBeforeAction,
    txTimestamp,
  );

  const userBalanceIncrease =
    userCurrentBorrowBalance - userDataBeforeAction.principalBorrowBalance;

  if (totalRepaid === MAX_UINT_VALUE) {
    //full repay in progress
    totalRepaid =
      userCurrentBorrowBalance + userDataBeforeAction.originationFee;
    // .toFixed(0);
  }

  if (userDataBeforeAction.originationFee < totalRepaid) {
    expectedUserData.originationFee = 0n;

    const totalRepaidMinusFees =
      totalRepaid - userDataBeforeAction.originationFee;

    expectedUserData.principalBorrowBalance =
      userDataBeforeAction.principalBorrowBalance +
      userBalanceIncrease -
      totalRepaidMinusFees;
    expectedUserData.currentBorrowBalance =
      userCurrentBorrowBalance - totalRepaidMinusFees;
  } else {
    expectedUserData.originationFee =
      userDataBeforeAction.originationFee - totalRepaid;
    expectedUserData.principalBorrowBalance = userCurrentBorrowBalance;
    expectedUserData.currentBorrowBalance = userCurrentBorrowBalance;
  }

  if (expectedUserData.currentBorrowBalance === 0n) {
    //user repaid everything
    expectedUserData.borrowRate = new BigNumber("0");
    // TODO(borrowRateMode): handle this?
    // expectedUserData.borrowRateMode = RATEMODE_NONE;
    expectedUserData.variableBorrowIndex = new BigNumber("0");
  } else {
    expectedUserData.borrowRate = expectedDataAfterAction.variableBorrowRate;
    expectedUserData.variableBorrowIndex =
      expectedDataAfterAction.variableBorrowIndex;
    // TODO(borrowRateMode): handle this?
    // expectedUserData.borrowRateMode = userDataBeforeAction.borrowRateMode;
  }

  expectedUserData.liquidityRate = expectedDataAfterAction.liquidityRate;

  expectedUserData.usageAsCollateralEnabled =
    userDataBeforeAction.usageAsCollateralEnabled;

  expectedUserData.currentATokenBalance = calcExpectedATokenBalance(
    reserveDataBeforeAction,
    userDataBeforeAction,
    txTimestamp,
  );
  expectedUserData.principalATokenBalance =
    userDataBeforeAction.principalATokenBalance;
  expectedUserData.redirectedBalance = userDataBeforeAction.redirectedBalance;
  expectedUserData.interestRedirectionAddress =
    userDataBeforeAction.interestRedirectionAddress;
  expectedUserData.redirectionAddressRedirectedBalance =
    userDataBeforeAction.redirectionAddressRedirectedBalance;
  expectedUserData.currentATokenUserIndex = calcExpectedATokenUserIndex(
    reserveDataBeforeAction,
    expectedUserData.currentATokenBalance,
    // TODO(redirects): handle?
    // expectedUserData.redirectedBalance,
    txTimestamp,
  );

  if (user === onBehalfOf) {
    //if user repaid for himself, update the wallet balances
    if (reserveDataBeforeAction.address === _config.ethereumAddress) {
      expectedUserData.walletBalance =
        userDataBeforeAction.walletBalance - txCost - totalRepaid;
    } else {
      expectedUserData.walletBalance =
        userDataBeforeAction.walletBalance - totalRepaid;
    }
  } else {
    //wallet balance didn't change
    expectedUserData.walletBalance = userDataBeforeAction.walletBalance;
  }

  return expectedUserData;
};

export const calcExpectedUserDataAfterSetUseAsCollateral = (
  useAsCollateral: boolean,
  reserveDataBeforeAction: ReserveData,
  userDataBeforeAction: UserReserveData,
  txCost: bigint,
): UserReserveData => {
  const expectedUserData = { ...userDataBeforeAction };

  expectedUserData.usageAsCollateralEnabled = useAsCollateral;

  if (reserveDataBeforeAction.address === _config.ethereumAddress) {
    expectedUserData.walletBalance -= txCost;
  }

  return expectedUserData;
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

const calcExpectedOriginationFee = (amount: bigint): bigint => {
  const feeBN = new BigNumber(amount.toString(10))
    .multipliedBy(0.0025)
    .decimalPlaces(0, BigNumber.ROUND_DOWN);

  return BigInt(feeBN.toString(10));
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
