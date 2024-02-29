import hre from "hardhat";
import chai from "chai";
import BigNumber from "bignumber.js";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

import {
  getEnvironment,
  MOCK_ETHER_PRICES,
  setupContracts,
} from "../lib/test/scenarios/common";
import {
  AddressesProvider,
  AToken,
  ERC20,
  IPriceOracle,
  LendingPool,
  LendingPoolCore,
} from "../typechain-types";
import { ETH, SYMBOLS } from "../lib/constants/tokens";
import {
  convertToCurrencyDecimals,
  getWhaleAddressForToken,
} from "../lib/test/helpers";
import { getTokenListForNetwork } from "../lib/utils/token";

const almostEqual = function (
  this: Chai.AssertionStatic,
  expectedBigInt: bigint,
  actualBigInt: bigint,
) {
  const expected = new BigNumber(expectedBigInt.toString());
  const actual = new BigNumber(actualBigInt.toString());

  this.assert(
    expected.plus(new BigNumber(1)).eq(actual) ||
      expected.plus(new BigNumber(2)).eq(actual) ||
      actual.plus(new BigNumber(1)).eq(expected) ||
      actual.plus(new BigNumber(2)).eq(expected) ||
      expected.eq(actual),
    "expected #{act} to be almost equal #{exp}",
    "expected #{act} to be different from #{exp}",
    expected.toString(),
    actual.toString(),
  );
};

chai.use(function (chai: Chai.ChaiStatic, utils: Chai.ChaiUtils) {
  chai.Assertion.overwriteMethod("almostEqual", function () {
    return function (this: Chai.AssertionStatic, expected: bigint) {
      // if (utils.flag(this, "bignumber")) {
      // const expected = new BigNumber(expectedBigInt.toString());
      // const actual = new BigNumber(this._obj);
      almostEqual.apply(this, [expected, this._obj]);
      // } else {
      //   original.apply(this, arguments);
      // }
    };
  });
});

describe.only("LendingPool liquidation - liquidator receiving underlying asset", () => {
  let tokens = new Map<string, ERC20>();
  let aTokensPerSymbol = new Map<string, AToken>();
  let depositorAddress: string;
  let borrowerAddress: string;
  let liquidatorAddress: string;
  let addressesProvider: AddressesProvider;
  let lendingPool: LendingPool;
  let priceOracle: IPriceOracle;
  let lendingPoolCore: LendingPoolCore;

  before(async () => {
    ({
      addressesProvider,
      lendingPool,
      lendingPoolCore,
      aTokensPerSymbol,
      fallbackOracle: priceOracle,
    } = await loadFixture(setupContracts));

    ({ tokens } = await getEnvironment());

    // Setup price oracle
    {
      const tokensAddresses = getTokenListForNetwork(hre.network);
      const daiAddress = tokensAddresses.get(SYMBOLS.DAI);
      if (!daiAddress) {
        throw new Error("DAI token not found");
      }

      await priceOracle.setAssetPrice(
        daiAddress,
        MOCK_ETHER_PRICES[SYMBOLS.DAI],
      );
      await priceOracle.setAssetPrice(ETH, hre.ethers.parseEther("1"));

      await addressesProvider.setPriceOracle(await priceOracle.getAddress());
    }

    ({
      firstDepositor: depositorAddress,
      firstBorrower: borrowerAddress,
      liquidator: liquidatorAddress,
    } = await hre.getNamedAccounts());
  });

  it("LIQUIDATION - Deposits ETH, borrows DAI", async () => {
    const dai = tokens.get(SYMBOLS.DAI);
    if (!dai) {
      throw new Error("DAI token not found");
    }
    const daiAddress = await dai.getAddress();

    const aEth = aTokensPerSymbol.get(`a${SYMBOLS.ETH}`);
    if (!aEth) {
      throw new Error("aETH token not found");
    }

    const depositor = await hre.ethers.getSigner(depositorAddress);
    const borrower = await hre.ethers.getSigner(borrowerAddress);

    // Transfer DAI to depositor
    {
      const whaleAddress = getWhaleAddressForToken(SYMBOLS.DAI);

      const whale = await hre.ethers.getImpersonatedSigner(whaleAddress);
      // Fund whale to pay for gas
      await setBalance(whaleAddress, hre.ethers.parseEther("1"));

      const tokensToTransfer = convertToCurrencyDecimals(SYMBOLS.DAI, "1000");
      await dai.connect(whale).transfer(depositorAddress, tokensToTransfer);
    }

    // Approve protocol to access depositor wallet
    await dai
      .connect(depositor)
      .approve(
        await lendingPoolCore.getAddress(),
        "100000000000000000000000000000",
      );

    // Depositor deposits 1000 DAI
    const amountDAItoDeposit = convertToCurrencyDecimals(SYMBOLS.DAI, "1000");

    await lendingPool
      .connect(depositor)
      .deposit(daiAddress, amountDAItoDeposit);

    // Borrower deposits 1 ETH
    const amountETHtoDeposit = convertToCurrencyDecimals(SYMBOLS.ETH, "1");
    await lendingPool.connect(borrower).deposit(ETH, amountETHtoDeposit, {
      value: amountETHtoDeposit,
    });

    // Borrower borrows
    const userGlobalData = await lendingPool.getUserAccountData(
      borrowerAddress,
    );

    const daiPrice = await priceOracle.getAssetPrice(dai);

    const amountDAIToBorrow = convertToCurrencyDecimals(
      SYMBOLS.DAI,
      new BigNumber(userGlobalData.availableBorrowsETH.toString())
        .div(new BigNumber(daiPrice.toString()))
        .multipliedBy(0.95)
        .toFixed(0),
    );

    await lendingPool.connect(borrower).borrow(dai, amountDAIToBorrow, "0");

    const userGlobalDataAfter = await lendingPool.getUserAccountData(borrower);

    expect(userGlobalDataAfter.currentLiquidationThreshold).to.be.equal(
      80n,
      "Invalid liquidation threshold",
    );
  });

  it("LIQUIDATION - Drop the health factor below 1", async () => {
    const dai = tokens.get(SYMBOLS.DAI);
    if (!dai) {
      throw new Error("DAI token not found");
    }

    const daiPrice = await priceOracle.getAssetPrice(dai);

    //halving the price of ETH - means doubling the DAIETH exchange rate
    await priceOracle.setAssetPrice(
      dai,
      new BigNumber(daiPrice.toString()).multipliedBy(1.15).toFixed(0),
    );

    const userGlobalData = await lendingPool.getUserAccountData(
      borrowerAddress,
    );

    expect(userGlobalData.healthFactor).to.be.lt(
      hre.ethers.parseEther("1"),
      "Invalid health factor",
    );
  });

  it.skip("LIQUIDATION - Liquidates the borrow", async () => {
    const dai = tokens.get(SYMBOLS.DAI);
    if (!dai) {
      throw new Error("DAI token not found");
    }

    const liquidator = await hre.ethers.getSigner(liquidatorAddress);

    // Transfer DAI to liquidator
    {
      const whaleAddress = getWhaleAddressForToken(SYMBOLS.DAI);

      const whale = await hre.ethers.getImpersonatedSigner(whaleAddress);
      // Fund whale to pay for gas
      await setBalance(whaleAddress, hre.ethers.parseEther("1"));

      const tokensToTransfer = convertToCurrencyDecimals(SYMBOLS.DAI, "1000");
      await dai.connect(whale).transfer(liquidatorAddress, tokensToTransfer);
    }

    await dai
      .connect(liquidator)
      .approve(
        await lendingPoolCore.getAddress(),
        "100000000000000000000000000000",
      );

    const userReserveDataBefore = await lendingPool.getUserReserveData(
      dai,
      borrowerAddress,
    );

    const amountToLiquidate = userReserveDataBefore.currentBorrowBalance / 2n;

    await lendingPool
      .connect(liquidator)
      .liquidationCall(ETH, dai, borrowerAddress, amountToLiquidate, false);

    const userReserveDataAfter = await lendingPool.getUserReserveData(
      dai,
      borrowerAddress,
    );

    const liquidatorReserveData = await lendingPool.getUserReserveData(
      ETH,
      liquidatorAddress,
    );

    const feeAddress = await addressesProvider.getTokenDistributor();

    const feeAddressBalance = await hre.ethers.provider.getBalance(feeAddress);

    expect(userReserveDataAfter.originationFee).to.eq(
      0n,
      "Origination fee should be repaid",
    );

    expect(feeAddressBalance).to.be.gt(0n);

    console.log({
      borrowBalanceBefore:
        userReserveDataBefore.principalBorrowBalance.toString(),
      borrowBalanceAfter:
        userReserveDataAfter.principalBorrowBalance.toString(),
      currentBorrowBalanceBefore:
        userReserveDataBefore.currentBorrowBalance.toString(),
      currentBorrowBalanceAfter:
        userReserveDataAfter.currentBorrowBalance.toString(),
      amountToLiquidate: amountToLiquidate.toString(),
      difference:
        userReserveDataBefore.currentBorrowBalance - amountToLiquidate,
    });

    expect(userReserveDataAfter.principalBorrowBalance).to.be.almostEqual(
      userReserveDataBefore.currentBorrowBalance - amountToLiquidate,
      "Invalid user borrow balance after liquidation",
    );
  });
});
