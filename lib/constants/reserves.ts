// TODO: consider reworking with BigNumber from `ethers` package
import BigNumber from "bignumber.js";

export type InterestRateStrategy = {
  optimalUsage: BigNumber;
  baseVariableBorrowRate: BigNumber;
  variableRateSlope1: BigNumber;
  variableRateSlope2: BigNumber;
};

export const STRATEGY_VOLATILE_ONE: InterestRateStrategy = {
  optimalUsage: new BigNumber(0.45).times(new BigNumber(10).pow(27)), // 45%
  baseVariableBorrowRate: new BigNumber(0),
  variableRateSlope1: new BigNumber(0.04).times(new BigNumber(10).pow(27)), // 4%
  variableRateSlope2: new BigNumber(3).times(new BigNumber(10).pow(27)), // 300%
};

export const OPTIMAL_UTILIZATION_RATE = new BigNumber(0.8).times(
  new BigNumber(10).pow(27),
);

export const EXCESS_UTILIZATION_RATE = new BigNumber(0.2).times(
  new BigNumber(10).pow(27),
);
