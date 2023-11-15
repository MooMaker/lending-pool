import hre from "hardhat";
import {
  AddressesProvider,
  AToken,
  DefaultReserveInterestRateStrategy,
  ERC20,
  LendingPool,
  LendingPoolCore,
} from "../../../typechain-types";
import { getTokenListForNetwork } from "../../utils/token";
import { SYMBOLS, TOKEN_DECIMALS } from "../../constants/tokens";
import { STRATEGY_VOLATILE_ONE } from "../../constants/reserves";
import { CHAINLINK_ETH_PRICE_DATA_FEEDS } from "../../constants/oracles";

export type TokenSymbol = string;
export type TokenAddress = string;

export async function getEnvironment(): Promise<{
  tokens: Map<TokenSymbol, ERC20>;
  tokensPerAddress: Map<TokenAddress, ERC20>;
}> {
  const tokenList = getTokenListForNetwork(hre.network);

  const tokenContracts: Map<string, ERC20> = new Map<string, ERC20>();
  const tokenContractsPerAddress = new Map<string, ERC20>();

  const entries = tokenList.entries();
  for (const [symbol, address] of entries) {
    const token = await hre.ethers.getContractAt("ERC20", address);
    tokenContracts.set(symbol, token);
    tokenContractsPerAddress.set(address, token);
  }

  return {
    tokens: tokenContracts,
    tokensPerAddress: tokenContractsPerAddress,
  };
}

// TODO: revisit. Why changing RESERVE_LTV to 80 leads to enough collateral?
const RESERVE_LTV = "60";

export async function setupContracts(): Promise<{
  addressesProvider: AddressesProvider;
  lendingPool: LendingPool;
  lendingPoolCore: LendingPoolCore;
  aTokensPerSymbol: Map<string, AToken>;
  aTokensPerAddress: Map<string, AToken>;
  interestRateStrategies: Map<string, DefaultReserveInterestRateStrategy>;
}> {
  const deployContracts = async () => {
    const coreLibraryFactory = await hre.ethers.getContractFactory(
      "CoreLibrary",
    );
    const coreLibrary = await coreLibraryFactory.deploy();

    const addressesProviderFactory = await hre.ethers.getContractFactory(
      "AddressesProvider",
    );
    const addressesProvider = await addressesProviderFactory.deploy();

    const feeProviderFactory = await hre.ethers.getContractFactory(
      "FeeProvider",
    );
    const feeProvider = await feeProviderFactory.deploy();

    const lendingPoolFactory = await hre.ethers.getContractFactory(
      "LendingPool",
    );
    const lendingPool = await lendingPoolFactory.deploy();

    const lendingPoolCoreFactory = await hre.ethers.getContractFactory(
      "LendingPoolCore",
      {
        libraries: {
          CoreLibrary: await coreLibrary.getAddress(),
        },
      },
    );
    const lendingPoolCore = await lendingPoolCoreFactory.deploy();

    const lendingPoolDataProviderFactory = await hre.ethers.getContractFactory(
      "LendingPoolDataProvider",
    );
    const lendingPoolDataProvider =
      await lendingPoolDataProviderFactory.deploy();

    return {
      addressesProvider,
      lendingPool,
      lendingPoolCore,
      lendingPoolDataProvider,
      feeProvider,
    };
  };

  const {
    addressesProvider,
    lendingPool,
    lendingPoolCore,
    lendingPoolDataProvider,
    feeProvider,
  } = await deployContracts();

  const deployChainlinkPriceOracle = async () => {
    const reserveAddresses: string[] = [];
    const dataFeedAddresses: string[] = [];

    const tokenList = getTokenListForNetwork(hre.network);
    const entries = tokenList.entries();
    for (const [symbol, address] of entries) {
      // No need for data feed for ETH
      if (symbol === SYMBOLS.ETH) {
        continue;
      }

      const dataFeedAddress =
        // TODO: rework to obtain for specific network?
        CHAINLINK_ETH_PRICE_DATA_FEEDS.MAINNET.get(symbol);
      if (!dataFeedAddress) {
        throw new Error(`Data feed address for ${symbol} is not found.`);
      }

      reserveAddresses.push(address);
      dataFeedAddresses.push(dataFeedAddress);
    }

    const chainLinkProxyPriceProviderFactory =
      await hre.ethers.getContractFactory("ChainLinkProxyPriceProvider");
    return chainLinkProxyPriceProviderFactory.deploy(
      reserveAddresses,
      dataFeedAddresses,
    );
  };

  const chainLinkProxyPriceProvider = await deployChainlinkPriceOracle();

  const setup = async () => {
    // Setup addresses provider
    await addressesProvider.setLendingPoolCoreImpl(
      await lendingPoolCore.getAddress(),
    );
    await addressesProvider.setLendingPoolImpl(await lendingPool.getAddress());
    await addressesProvider.setLendingPoolDataProviderImpl(
      await lendingPoolDataProvider.getAddress(),
    );
    await addressesProvider.setPriceOracle(
      await chainLinkProxyPriceProvider.getAddress(),
    );

    await addressesProvider.setFeeProviderImpl(await feeProvider.getAddress());

    // Initialize lending pool core
    await lendingPoolCore.initialize(addressesProvider);

    // Initialize lending pool
    await lendingPool.initialize(addressesProvider);

    // Initialize data provider
    await lendingPoolDataProvider.initialize(addressesProvider);

    // Initialize fee provider
    await feeProvider.initialize(addressesProvider);
  };

  await setup();

  const deployATokens = async () => {
    const tokenPrefix = "a";

    const aTokensPerSymbol: Map<string, AToken> = new Map<string, AToken>();
    const aTokensPerAddress: Map<string, AToken> = new Map<string, AToken>();

    const tokenList = getTokenListForNetwork(hre.network);
    const entries = tokenList.entries();
    for (const [symbol, tokenAddress] of entries) {
      const decimals = TOKEN_DECIMALS.get(symbol);
      if (!decimals) {
        throw new Error(`Decimals for ${symbol} is not found.`);
      }

      const name = `Liquorice interest bearing ${symbol}`;

      const aTokenSymbol = `${tokenPrefix}${symbol}`;
      const aTokenFactory = await hre.ethers.getContractFactory("AToken");

      const aToken = await aTokenFactory.deploy(
        addressesProvider,
        tokenAddress,
        decimals,
        name,
        aTokenSymbol,
      );

      const address = await aToken.getAddress();
      aTokensPerSymbol.set(aTokenSymbol, aToken);
      aTokensPerAddress.set(address, aToken);
    }

    return { aTokensPerSymbol, aTokensPerAddress };
  };

  const { aTokensPerSymbol, aTokensPerAddress } = await deployATokens();

  const deployInterestRateStrategies = async () => {
    const interestRateStrategies = new Map<
      string,
      DefaultReserveInterestRateStrategy
    >();

    const tokenList = getTokenListForNetwork(hre.network);
    const entries = tokenList.entries();
    for (const [symbol, tokenAddress] of entries) {
      const name = `${symbol}InterestRateStrategy`;

      const interestRateStrategyFactory = await hre.ethers.getContractFactory(
        "DefaultReserveInterestRateStrategy",
      );

      const interestRateStrategy = await interestRateStrategyFactory.deploy(
        tokenAddress,
        addressesProvider,
        // TODO: consider reworking with big number
        `0x${STRATEGY_VOLATILE_ONE.baseVariableBorrowRate.toString(16)}`,
        `0x${STRATEGY_VOLATILE_ONE.variableRateSlope1.toString(16)}`,
        `0x${STRATEGY_VOLATILE_ONE.variableRateSlope2.toString(16)}`,
      );

      interestRateStrategies.set(name, interestRateStrategy);
    }

    return interestRateStrategies;
  };

  const interestRateStrategies = await deployInterestRateStrategies();

  const initReserves = async () => {
    const tokenList = getTokenListForNetwork(hre.network);
    const entries = tokenList.entries();
    for (const [symbol, tokenAddress] of entries) {
      const interestRateStrategy = interestRateStrategies.get(
        `${symbol}InterestRateStrategy`,
      );
      if (!interestRateStrategy) {
        throw new Error(`Interest rate strategy for ${symbol} is not found.`);
      }

      const aToken = aTokensPerSymbol.get(`a${symbol}`);
      if (!aToken) {
        throw new Error(`aToken for ${symbol} is not found.`);
      }

      const decimals = await aToken.decimals();

      await lendingPoolCore.initReserve(
        tokenAddress,
        aToken,
        decimals,
        interestRateStrategy,
      );

      await lendingPoolCore.enableReserveAsCollateral(
        tokenAddress,
        RESERVE_LTV,
      );
    }
  };

  await initReserves();

  return {
    addressesProvider,
    lendingPool,
    lendingPoolCore,
    aTokensPerSymbol,
    aTokensPerAddress,
    interestRateStrategies,
  };
}
