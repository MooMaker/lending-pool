import hre from "hardhat";
import {
  AddressesProvider,
  AToken,
  ChainLinkProxyPriceProvider,
  DefaultReserveInterestRateStrategy,
  ERC20,
  IPriceOracle,
  LendingPool,
  LendingPoolCore,
} from "../../../typechain-types";
import { getTokenListForNetwork } from "../../utils/token";
import { SYMBOLS, TOKEN_DECIMALS } from "../../constants/tokens";
import { STRATEGY_VOLATILE_ONE } from "../../constants/reserves";

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

const RESERVE_LTV = 80n;
const LIQUIDATION_THRESHOLD = 80n;
const LIQUIDATION_BONUS = 1n;

export const MOCK_ETHER_PRICES = {
  [SYMBOLS.DAI]: hre.ethers.parseEther("0.001"),
  [SYMBOLS.USDC]: hre.ethers.parseEther("0.001"),
  [SYMBOLS.LINK]: hre.ethers.parseEther("0.01"),
};

export async function setupContracts(): Promise<{
  addressesProvider: AddressesProvider;
  lendingPool: LendingPool;
  lendingPoolCore: LendingPoolCore;
  chainLinkPriceOracle: ChainLinkProxyPriceProvider;
  fallbackOracle: IPriceOracle;
  aTokensPerSymbol: Map<string, AToken>;
  aTokensPerAddress: Map<string, AToken>;
  interestRateStrategies: Map<string, DefaultReserveInterestRateStrategy>;
}> {
  const deployContracts = async () => {
    const coreLibrary = await hre.ethers
      .getContractFactory("CoreLibrary")
      .then((factory) => factory.deploy());

    const addressesProvider = await hre.ethers
      .getContractFactory("AddressesProvider")
      .then((factory) => factory.deploy());

    const feeProvider = await hre.ethers
      .getContractFactory("FeeProvider")
      .then((factory) => factory.deploy());

    const tokenDistributor = await hre.ethers
      .getContractFactory("TokenDistributor")
      .then((factory) => factory.deploy());

    const lendingPool = await hre.ethers
      .getContractFactory("LendingPool")
      .then((factory) => factory.deploy());

    const lendingPoolCore = await hre.ethers
      .getContractFactory("LendingPoolCore", {
        libraries: {
          CoreLibrary: await coreLibrary.getAddress(),
        },
      })
      .then((factory) => factory.deploy());

    const lendingPoolDataProvider = await hre.ethers
      .getContractFactory("LendingPoolDataProvider")
      .then((factory) => factory.deploy());

    return {
      addressesProvider,
      lendingPool,
      lendingPoolCore,
      lendingPoolDataProvider,
      feeProvider,
      tokenDistributor,
    };
  };

  const {
    addressesProvider,
    lendingPool,
    lendingPoolCore,
    lendingPoolDataProvider,
    feeProvider,
    tokenDistributor,
  } = await deployContracts();

  const deployPriceOracle = async () => {
    const reserveAddresses: string[] = [];
    const dataFeedAddresses: string[] = [];

    const tokenList = getTokenListForNetwork(hre.network);

    // Deploy fallback oracle
    const fallbackOracle = await hre.ethers
      .getContractFactory("PriceOracle")
      .then((factory) => factory.deploy());

    // Setup Chainlink data feeds
    const entries = tokenList.entries();
    for (const [symbol, address] of entries) {
      // No need for data feed for ETH
      if (symbol === SYMBOLS.ETH) {
        continue;
      }

      const mockEthPrice = MOCK_ETHER_PRICES[symbol];
      if (!mockEthPrice) {
        throw new Error(`Mock ETH price for ${symbol} is not found.`);
      }

      // Provide LINK price via fallback oracle
      if (symbol === SYMBOLS.LINK) {
        await fallbackOracle.setAssetPrice(address, mockEthPrice);
        continue;
      }

      const dataAggregator = await hre.ethers
        .getContractFactory("CLMockAggregator")
        .then((factory) => factory.deploy(mockEthPrice));

      reserveAddresses.push(address);
      dataFeedAddresses.push(await dataAggregator.getAddress());
    }

    const chainLinkProxyPriceProviderFactory =
      await hre.ethers.getContractFactory("ChainLinkProxyPriceProvider");

    const chainLinkProxyPriceProvider =
      await chainLinkProxyPriceProviderFactory.deploy(
        reserveAddresses,
        dataFeedAddresses,
        await fallbackOracle.getAddress(),
      );

    return {
      chainLinkProxyPriceProvider,
      fallbackOracle,
    };
  };

  const { chainLinkProxyPriceProvider, fallbackOracle } =
    await deployPriceOracle();

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
    await addressesProvider.setTokenDistributor(
      await tokenDistributor.getAddress(),
    );

    // Initialize lending pool core
    await lendingPoolCore.initialize(addressesProvider);

    // Initialize lending pool
    await lendingPool.initialize(addressesProvider);

    // Initialize data provider
    await lendingPoolDataProvider.initialize(addressesProvider);

    // Initialize fee provider
    await feeProvider.initialize(addressesProvider);

    const [owner] = await hre.ethers.getSigners();
    // Initialize token distributor with one beneficiary
    await tokenDistributor.initialize([owner.address], [100]);
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
        LIQUIDATION_THRESHOLD,
        LIQUIDATION_BONUS,
      );
    }
  };

  await initReserves();

  return {
    addressesProvider,
    lendingPool,
    lendingPoolCore,
    chainLinkPriceOracle: chainLinkProxyPriceProvider,
    fallbackOracle,
    aTokensPerSymbol,
    aTokensPerAddress,
    interestRateStrategies,
  };
}
