import hre from "hardhat";
import chai from "chai";
import { setBalance, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ContractTransactionResponse } from "ethers";

import {
  convertToCurrencyDecimals,
  getReserveData,
  getUserData,
  getWhaleAddressForToken,
} from "../helpers";
import { ETH as ETH_ADDRESS, SYMBOLS } from "../../constants/tokens";
import {
  calcExpectedReserveDataAfterBorrow,
  calcExpectedReserveDataAfterDeposit,
  calcExpectedUserDataAfterBorrow,
  calcExpectedUserDataAfterDeposit,
  calcExpectedReserveDataAfterRepay,
  calcExpectedUserDataAfterRepay,
  calcExpectedReserveDataAfterRedeem,
  calcExpectedUserDataAfterRedeem,
  calcExpectedUserDataAfterSetUseAsCollateral,
} from "../calculations";
import { ReserveData, UserReserveData } from "../../types";
import { expect } from "chai";
import { AToken, LendingPool, LendingPoolCore } from "../../../typechain-types";
import { getEnvironment } from "./common";
import BigNumber from "bignumber.js";
import { MAX_UINT_VALUE, SECONDS_PER_YEAR } from "../../constants/common";

type ActionsConfig = {
  contracts: {
    lendingPool?: LendingPool;
    lendingPoolCore?: LendingPoolCore;
    aTokensPerAddress: Map<string, AToken>;
    aTokensPerSymbol: Map<string, AToken>;
  };
  ethereumAddress: string;
  skipIntegrityCheck: boolean;
};

let _config: ActionsConfig = {
  contracts: {
    aTokensPerSymbol: new Map(),
    aTokensPerAddress: new Map(),
  },
  ethereumAddress: ETH_ADDRESS,
  skipIntegrityCheck: false,
};

export const setConfig = (config: ActionsConfig) => {
  _config = config;
};

export const getConfig = () => {
  return _config;
};

export const transfer = async (
  reserveSymbol: string,
  amount: string,
  user: string,
  userIndex: number,
) => {
  const { tokens } = await getEnvironment();

  if (reserveSymbol === SYMBOLS.ETH) {
    throw new Error(
      "Cannot mint ethereum. Mint action is most likely not needed in this story",
    );
  }

  const tokenContract = tokens.get(reserveSymbol);
  if (!tokenContract) {
    throw `Token contract not found for ${reserveSymbol}`;
  }

  const whaleAddress = getWhaleAddressForToken(reserveSymbol);

  const whale = await hre.ethers.getImpersonatedSigner(whaleAddress);
  // Fund whale to pay for gas
  await setBalance(whaleAddress, hre.ethers.parseEther("1"));

  const whaleTokenBalance = await tokenContract.balanceOf(whaleAddress);

  const tokensToTransfer = convertToCurrencyDecimals(reserveSymbol, amount);
  const tokenDecimals = await tokenContract.decimals();

  console.log(
    `[Action: Transfer] Whale ${whaleAddress} with balance ${hre.ethers.formatUnits(
      whaleTokenBalance,
      tokenDecimals,
    )} transfers ${amount} ${reserveSymbol} to user ${userIndex}`,
  );
  await tokenContract.connect(whale).transfer(user, tokensToTransfer);

  const userBalance = await tokenContract.balanceOf(user);
  console.log(
    `[Action: Transfer] User ${userIndex} balance after transfer ${hre.ethers.formatUnits(
      userBalance,
      tokenDecimals,
    )} ${reserveSymbol}`,
  );
};

export const approve = async (
  reserveSymbol: string,
  userAddress: string,
  userIndex: number,
) => {
  const { tokens } = await getEnvironment();
  const { lendingPoolCore } = _config.contracts;

  if (!lendingPoolCore) {
    throw new Error("Lending pool core is not set in configuration");
  }

  if (reserveSymbol === SYMBOLS.ETH) {
    throw new Error(
      "Cannot mint ethereum. Mint action is most likely not needed in this story",
    );
  }

  const tokenContract = tokens.get(reserveSymbol);
  if (!tokenContract) {
    throw new Error(`Token contract not found for ${reserveSymbol}`);
  }

  const user = await hre.ethers.getSigner(userAddress);
  const userBalance = await tokenContract.balanceOf(userAddress);
  const tokenDecimals = await tokenContract.decimals();

  const lendingPoolCoreAddress = await lendingPoolCore.getAddress();

  console.log(
    `[Action: Approve] User ${userIndex} with balance ${hre.ethers.formatUnits(
      userBalance,
      tokenDecimals,
    )} ${reserveSymbol} approves spending to core ${lendingPoolCoreAddress}`,
  );
  await tokenContract
    .connect(user)
    .approve(lendingPoolCoreAddress, "100000000000000000000000000000");
  const allowance = await tokenContract.allowance(
    userAddress,
    lendingPoolCoreAddress,
  );
  console.log(
    `[Action: Approve] Contract ${lendingPoolCoreAddress} allowance is now ${hre.ethers.formatUnits(
      allowance,
      tokenDecimals,
    )}`,
  );
};

export const deposit = async (
  reserveSymbol: string,
  amount: string,
  userAddress: string,
  userIndex: number,
  sendValue: string | undefined,
  expectedResult: string,
  revertMessage?: string,
) => {
  const { lendingPool, lendingPoolCore } = _config.contracts;
  const { tokens } = await getEnvironment();

  let balance = 0n;
  let decimals = 18n;
  let reserve = ETH_ADDRESS;

  if (reserveSymbol === SYMBOLS.ETH) {
    balance = await hre.ethers.provider.getBalance(userAddress);
  } else {
    const tokenContract = tokens.get(reserveSymbol);
    if (!tokenContract) {
      throw new Error(`Token contract not found for ${reserveSymbol}`);
    }

    balance = await tokenContract.balanceOf(userAddress);
    decimals = await tokenContract.decimals();
    reserve = await tokenContract.getAddress();
  }

  if (!lendingPool) {
    throw new Error("Lending pool is not set in configuration");
  }

  if (!lendingPoolCore) {
    throw new Error("Lending pool core is not set in configuration");
  }

  const amountToDeposit = convertToCurrencyDecimals(reserveSymbol, amount);

  const { reserveData: reserveDataBefore, userData: userDataBefore } =
    await getContractsData(reserve, userAddress);

  const txOptions = {
    value: 0n,
  };
  if (ETH_ADDRESS === reserve) {
    if (sendValue) {
      txOptions.value = convertToCurrencyDecimals(reserveSymbol, sendValue);
    } else {
      txOptions.value = amountToDeposit;
    }
  }

  const user = await hre.ethers.getSigner(userAddress);

  console.log(
    `[Action: Deposit] User ${userIndex} with balance of ${hre.ethers.formatUnits(
      balance,
      decimals,
    )} ${reserveSymbol} deposits ${amount} ${reserveSymbol} to the pool`,
  );

  if (expectedResult === "success") {
    const { tokens } = await getEnvironment();
    // TODO: why?
    const dai = tokens.get("DAI");
    if (!dai) {
      throw new Error("DAI token not found in environment");
    }

    const txResult = await lendingPool
      .connect(user)
      .deposit(reserve, amountToDeposit, txOptions);

    const {
      reserveData: reserveDataAfter,
      userData: userDataAfter,
      timestamp,
    } = await getContractsData(reserve, userAddress);

    const { txCost, txTimestamp } = await getTxCostAndTimestamp(txResult);

    const expectedReserveData = calcExpectedReserveDataAfterDeposit(
      amountToDeposit,
      reserveDataBefore,
      txTimestamp,
    );

    const expectedUserReserveData = calcExpectedUserDataAfterDeposit(
      amountToDeposit,
      reserveDataBefore,
      expectedReserveData,
      userDataBefore,
      txTimestamp,
      timestamp,
      txCost,
    );

    expectEqual(reserveDataAfter, expectedReserveData);
    expectEqual(userDataAfter, expectedUserReserveData);

    await expect(txResult)
      .to.emit(lendingPool, "Deposit")
      .withArgs(reserve, userAddress, amountToDeposit, txTimestamp);
  } else if (expectedResult === "revert") {
    if (!revertMessage) {
      throw new Error("Revert message is missing in scenario");
    }

    const txResult = lendingPool
      .connect(user)
      .deposit(reserve, amountToDeposit, txOptions);
    await expect(txResult).to.be.revertedWith(revertMessage);
  }
};

export const borrow = async (
  reserveSymbol: string,
  amount: string,
  userAddress: string,
  userIndex: number,
  timeTravel: string | undefined,
  expectedResult: string,
  revertMessage?: string,
) => {
  const { lendingPool } = _config.contracts;
  const { tokens } = await getEnvironment();

  let reserve = ETH_ADDRESS;

  if (reserveSymbol !== SYMBOLS.ETH) {
    const tokenContract = tokens.get(reserveSymbol);
    if (!tokenContract) {
      throw new Error(`Token contract not found for ${reserveSymbol}`);
    }

    reserve = await tokenContract.getAddress();
  }

  if (!lendingPool) {
    throw new Error("Lending pool is not set in configuration");
  }

  const { reserveData: reserveDataBefore, userData: userDataBefore } =
    await getContractsData(reserve, userAddress);

  const amountToBorrow = convertToCurrencyDecimals(reserveSymbol, amount);

  const user = await hre.ethers.getSigner(userAddress);

  console.log(
    `[Action: Borrow] User ${userIndex} borrows ${amount} ${reserveSymbol} from the pool`,
  );

  if (expectedResult === "success") {
    const txResult = await lendingPool
      .connect(user)
      .borrow(reserve, amountToBorrow, "0");

    const { txCost, txTimestamp } = await getTxCostAndTimestamp(txResult);

    if (timeTravel) {
      const secondsToTravel = new BigNumber(timeTravel)
        .multipliedBy(SECONDS_PER_YEAR)
        .div(365)
        .toNumber();

      await time.increase(secondsToTravel);
    }

    const {
      reserveData: reserveDataAfter,
      userData: userDataAfter,
      timestamp,
    } = await getContractsData(reserve, userAddress);

    const expectedReserveData = calcExpectedReserveDataAfterBorrow(
      amountToBorrow,
      reserveDataBefore,
      userDataBefore,
      txTimestamp,
    );

    const expectedUserData = calcExpectedUserDataAfterBorrow(
      amountToBorrow,
      reserveDataBefore,
      expectedReserveData,
      userDataBefore,
      txTimestamp,
      timestamp,
      txCost,
    );

    expectEqual(reserveDataAfter, expectedReserveData);
    expectEqual(userDataAfter, expectedUserData);

    await expect(txResult)
      .to.emit(lendingPool, "Borrow")
      .withArgs(
        reserve,
        userAddress,
        amountToBorrow,
        expectedUserData.borrowRate.toFixed(),
        anyValue,
        anyValue,
        anyValue,
        txTimestamp,
      );
  } else if (expectedResult === "revert") {
    if (!revertMessage) {
      throw new Error("Revert message is missing in scenario");
    }

    const txResult = lendingPool
      .connect(user)
      .borrow(reserve, amountToBorrow, "0");
    await expect(txResult).to.be.revertedWith(revertMessage);
  }
};

export const repay = async (
  reserveSymbol: string,
  amount: string,
  userAddress: string,
  userIndex: number,
  onBehalfOf: string,
  sendValue: string | undefined,
  expectedResult: string,
  revertMessage?: string,
) => {
  const { lendingPool } = _config.contracts;
  if (!lendingPool) {
    throw new Error("Lending pool is not set in configuration");
  }

  const { tokens } = await getEnvironment();

  let reserve = ETH_ADDRESS;

  if (reserveSymbol !== SYMBOLS.ETH) {
    const tokenContract = tokens.get(reserveSymbol);
    if (!tokenContract) {
      throw new Error(`Token contract not found for ${reserveSymbol}`);
    }

    reserve = await tokenContract.getAddress();
  }

  const { reserveData: reserveDataBefore, userData: userDataBefore } =
    await getContractsData(reserve, onBehalfOf);

  let amountToRepay = 0n;

  if (amount !== "-1") {
    amountToRepay = convertToCurrencyDecimals(reserveSymbol, amount);
  } else {
    amountToRepay = MAX_UINT_VALUE;
  }

  const txOptions = {
    value: 0n,
  };

  if (_config.ethereumAddress === reserve) {
    if (sendValue) {
      if (sendValue !== "-1") {
        txOptions.value = convertToCurrencyDecimals(reserveSymbol, sendValue);
      } else {
        txOptions.value =
          userDataBefore.currentBorrowBalance +
          convertToCurrencyDecimals(reserveSymbol, "0.1"); //.toFixed(0); //add 0.1 ETH to the repayment amount to cover for accrued interest during tx execution
      }
    } else {
      txOptions.value = amountToRepay;
    }
  }

  const user = await hre.ethers.getSigner(userAddress);

  console.log(
    `[Action: Repay] User ${userIndex} repays ${amount} ${reserveSymbol} to the pool`,
  );

  if (expectedResult === "success") {
    const txResult = await lendingPool
      .connect(user)
      .repay(reserve, amountToRepay, onBehalfOf, txOptions);

    const { txCost, txTimestamp } = await getTxCostAndTimestamp(txResult);

    const { reserveData: reserveDataAfter, userData: userDataAfter } =
      await getContractsData(reserve, onBehalfOf);

    const expectedReserveData = calcExpectedReserveDataAfterRepay(
      amountToRepay,
      reserveDataBefore,
      userDataBefore,
      txTimestamp,
    );

    const expectedUserData = calcExpectedUserDataAfterRepay(
      amountToRepay,
      reserveDataBefore,
      expectedReserveData,
      userDataBefore,
      userAddress,
      onBehalfOf,
      txTimestamp,
      txCost,
    );

    expectEqual(reserveDataAfter, expectedReserveData);
    expectEqual(userDataAfter, expectedUserData);

    await expect(txResult)
      .to.emit(lendingPool, "Repay")
      .withArgs(
        reserve,
        onBehalfOf,
        userAddress,
        anyValue,
        anyValue,
        anyValue,
        txTimestamp,
      );
  } else if (expectedResult === "revert") {
    if (!revertMessage) {
      throw new Error("Revert message is missing in scenario");
    }

    const txResult = lendingPool
      .connect(user)
      .repay(reserve, amountToRepay, onBehalfOf, txOptions);
    await expect(txResult).to.be.revertedWith(revertMessage);
  }
};

export const redeem = async (
  reserveSymbol: string,
  amount: string,
  userAddress: string,
  userIndex: number,
  expectedResult: string,
  revertMessage?: string,
) => {
  const {
    aTokenInstance,
    reserve,
    userData: userDataBefore,
    reserveData: reserveDataBefore,
  } = await getDataBeforeAction(reserveSymbol, userAddress);

  let amountToRedeem = 0n;

  if (amount !== "-1") {
    amountToRedeem = convertToCurrencyDecimals(reserveSymbol, amount);
  } else {
    amountToRedeem = MAX_UINT_VALUE;
  }

  const user = await hre.ethers.getSigner(userAddress);

  console.log(
    `[Action: Redeem] User ${userIndex} redeems ${amount} ${reserveSymbol} from pool`,
  );

  if (expectedResult === "success") {
    const txResult = await aTokenInstance.connect(user).redeem(amountToRedeem);

    const {
      reserveData: reserveDataAfter,
      userData: userDataAfter,
      timestamp,
    } = await getContractsData(reserve, userAddress);

    const { txCost, txTimestamp } = await getTxCostAndTimestamp(txResult);
    const expectedReserveData = calcExpectedReserveDataAfterRedeem(
      amountToRedeem,
      reserveDataBefore,
      userDataBefore,
      txTimestamp,
    );

    const expectedUserData = calcExpectedUserDataAfterRedeem(
      amountToRedeem,
      reserveDataBefore,
      expectedReserveData,
      userDataBefore,
      txTimestamp,
      timestamp,
      txCost,
    );

    const actualAmountRedeemed =
      userDataBefore.currentATokenBalance -
      expectedUserData.currentATokenBalance;

    expectEqual(reserveDataAfter, expectedReserveData);
    expectEqual(userDataAfter, expectedUserData);

    await expect(txResult)
      .to.emit(aTokenInstance, "Redeem")
      .withArgs(userAddress, actualAmountRedeemed, anyValue, anyValue);
  } else if (expectedResult === "revert") {
    if (!revertMessage) {
      throw new Error("Revert message is missing in scenario");
    }

    const txResult = aTokenInstance.connect(user).redeem(amountToRedeem);

    await expect(txResult).to.be.revertedWith(revertMessage);
  }
};

export const setUseAsCollateral = async (
  reserveSymbol: string,
  userAddress: string,
  userIndex: number,
  useAsCollateral: string,
  expectedResult: string,
  revertMessage?: string,
) => {
  const { lendingPool } = _config.contracts;
  if (!lendingPool) {
    throw new Error("Lending pool is not set in configuration");
  }

  const { tokens } = await getEnvironment();

  let reserve = ETH_ADDRESS;

  if (reserveSymbol !== SYMBOLS.ETH) {
    const tokenContract = tokens.get(reserveSymbol);
    if (!tokenContract) {
      throw new Error(`Token contract not found for ${reserveSymbol}`);
    }

    reserve = await tokenContract.getAddress();
  }

  const { reserveData: reserveDataBefore, userData: userDataBefore } =
    await getContractsData(reserve, userAddress);

  const useAsCollateralBool = useAsCollateral.toLowerCase() === "true";

  const user = await hre.ethers.getSigner(userAddress);
  console.log(
    `[Action: SetUseAsCollateral] User ${userIndex} sets use as collateral for ${reserveSymbol} to ${useAsCollateral}`,
  );

  if (expectedResult === "success") {
    const txResult = await lendingPool
      .connect(user)
      .setUserUseReserveAsCollateral(reserve, useAsCollateralBool);

    const { txCost } = await getTxCostAndTimestamp(txResult);

    const { userData: userDataAfter } = await getContractsData(
      reserve,
      userAddress,
    );

    const expectedUserData = calcExpectedUserDataAfterSetUseAsCollateral(
      useAsCollateralBool,
      reserveDataBefore,
      userDataBefore,
      txCost,
    );

    expectEqual(userDataAfter, expectedUserData);
    if (useAsCollateralBool) {
      await expect(txResult)
        .to.emit(lendingPool, "ReserveUsedAsCollateralEnabled")
        .withArgs(reserve, userAddress);
    } else {
      await expect(txResult)
        .to.emit(lendingPool, "ReserveUsedAsCollateralDisabled")
        .withArgs(reserve, userAddress);
    }
  } else if (expectedResult === "revert") {
    if (!revertMessage) {
      throw new Error("Revert message is missing in scenario");
    }

    const txResult = lendingPool
      .connect(user)
      .setUserUseReserveAsCollateral(reserve, useAsCollateralBool);

    await expect(txResult).to.be.revertedWith(revertMessage);
  }
};

const getTxCostAndTimestamp = async (tx: ContractTransactionResponse) => {
  const receipt = await tx.wait();

  let txCost;
  let txTimestamp;
  if (receipt) {
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
    if (!block) {
      throw `Tx ${tx.hash} not in block`;
    }

    txTimestamp = BigInt(block.timestamp);
    txCost = receipt.cumulativeGasUsed * receipt.gasPrice;
  } else {
    throw `Tx ${tx.hash} has no receipt`;
  }

  return { txCost, txTimestamp };
};

const getDataBeforeAction = async (
  reserveSymbol: string,
  userAddress: string,
) => {
  const { tokens } = await getEnvironment();

  let reserve = ETH_ADDRESS;

  if (reserveSymbol !== SYMBOLS.ETH) {
    const tokenContract = tokens.get(reserveSymbol);
    if (!tokenContract) {
      throw new Error(`Token contract not found for ${reserveSymbol}`);
    }

    reserve = await tokenContract.getAddress();
  }

  const { reserveData, userData } = await getContractsData(
    reserve,
    userAddress,
  );

  const { aTokenAddress } = reserveData;

  const { aTokensPerAddress } = getConfig().contracts;
  const aTokenInstance = aTokensPerAddress.get(aTokenAddress);

  if (!aTokenInstance) {
    throw `Could not find aToken instance for ${aTokenAddress}`;
  }

  return {
    reserve,
    reserveData,
    userData,
    aTokenInstance,
  };
};

const getContractsData = async (reserve: string, user: string) => {
  const { lendingPool, lendingPoolCore } = _config.contracts;

  if (!lendingPool) {
    throw new Error("Lending pool is not set in configuration");
  }

  if (!lendingPoolCore) {
    throw new Error("Lending pool core is not set in configuration");
  }

  const [reserveData, userData, timestamp] = await Promise.all([
    getReserveData(lendingPool, reserve),
    getUserData(lendingPool, lendingPoolCore, reserve, user),
    time.latest(),
  ]);

  return {
    reserveData,
    userData,
    timestamp: BigInt(timestamp),
  };
};

const expectEqual = (
  actual: UserReserveData | ReserveData,
  expected: UserReserveData | ReserveData,
) => {
  // Ignoring because don't want to spend time on extending Assertion interface
  // eslint-disable-next-line
  // @ts-ignore
  expect(actual).to.be.almostEqualOrEqual(expected);
};

const almostEqualOrEqual = function (
  this: Chai.AssertionStatic,
  expected: ReserveData | UserReserveData,
  actual: ReserveData | UserReserveData,
) {
  const keys = Object.keys(actual);
  keys.forEach((key) => {
    if (
      key === "lastUpdateTimestamp" ||
      key === "marketStableRate" ||
      key === "symbol" ||
      key === "aTokenAddress" ||
      key === "initialATokenExchangeRate" ||
      key === "decimals"
    ) {
      //skipping consistency check on accessory data
      return;
    }

    this.assert(
      actual[key] != undefined,
      `Property ${key} is undefined in the actual data`,
      `Property ${key} is not undefined in the actual data`,
      expected[key],
    );
    expect(
      expected[key] != undefined,
      `Property ${key} is undefined in the expected data`,
    );

    if (actual[key] instanceof BigNumber || typeof actual[key] === "bigint") {
      let actualValueBN: BigNumber;
      let expectedValueBN: BigNumber;
      if (typeof actual[key] === "bigint") {
        actualValueBN = new BigNumber(actual[key].toString());
        expectedValueBN = new BigNumber(expected[key].toString());
      } else {
        actualValueBN = actual[key] as BigNumber;
        expectedValueBN = expected[key] as BigNumber;
      }

      const actualValue = actualValueBN.decimalPlaces(0, BigNumber.ROUND_DOWN);
      const expectedValue = expectedValueBN.decimalPlaces(
        0,
        BigNumber.ROUND_DOWN,
      );

      this.assert(
        actualValue.eq(expectedValue) ||
          actualValue.plus(1).eq(expectedValue) ||
          actualValue.eq(expectedValue.plus(1)) ||
          actualValue.plus(2).eq(expectedValue) ||
          actualValue.eq(expectedValue.plus(2)),
        `expected #{act} to be almost equal or equal #{exp} for property ${key}`,
        `expected #{act} to be almost equal or equal #{exp} for property ${key}`,
        expectedValue.toFixed(0),
        actualValue.toFixed(0),
      );
    } else {
      this.assert(
        actual[key] !== null &&
          expected[key] !== null &&
          actual[key].toString() === expected[key].toString(),
        `expected #{act} to be equal #{exp} for property ${key}`,
        `expected #{act} to be equal #{exp} for property ${key}`,
        expected[key],
        actual[key],
      );
    }
  });
};

chai.use(function (chai: Chai.ChaiStatic) {
  chai.Assertion.overwriteMethod("almostEqualOrEqual", function () {
    return function (
      this: Chai.AssertionStatic,
      expected: ReserveData | UserReserveData,
    ) {
      const actual = (expected as ReserveData)
        ? <ReserveData>this._obj
        : <UserReserveData>this._obj;

      almostEqualOrEqual.apply(this, [expected, actual]);
    };
  });
});
