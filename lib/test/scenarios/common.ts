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
import {
  MAINNET_ADDRESSES,
  SYMBOLS,
  TOKEN_DECIMALS,
} from "../../constants/tokens";
import { ATokenInfo } from "../../../scripts/2-token-actions/200_deploy_reserve_atokens";
import { STRATEGY_VOLATILE_ONE } from "../../constants/reserves";
import { CHAINLINK_ETH_PRICE_DATA_FEEDS } from "../../constants/oracles";

export type TokenSymbol = string;
export type TokenAddress = string;

export async function getEnvironment(): Promise<{
  tokens: Map<TokenSymbol, ERC20>;
  tokensPerAddress: Map<TokenAddress, ERC20>;
}> {
  const tokenList = getTokenListForNetwork(hre.network);

  const usdcAddress = tokenList.get("USDC");
  const daiAddress = tokenList.get("DAI");

  if (!usdcAddress || !daiAddress) {
    throw new Error(
      `Address for one of the tokens is not found.\nUSDC: ${usdcAddress}\nDAI: ${daiAddress}`,
    );
  }

  const usdc = await hre.ethers.getContractAt("ERC20", usdcAddress);
  const dai = await hre.ethers.getContractAt("ERC20", daiAddress);

  const tokens: Map<string, ERC20> = new Map<string, ERC20>();
  tokens.set("USDC", usdc);
  tokens.set("DAI", dai);

  const tokensPerAddress = new Map<string, ERC20>();
  tokensPerAddress.set(usdcAddress, usdc);
  tokensPerAddress.set(daiAddress, dai);

  return {
    tokens,
    tokensPerAddress,
  };
}

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
    };
  };

  const {
    addressesProvider,
    lendingPool,
    lendingPoolCore,
    lendingPoolDataProvider,
  } = await deployContracts();

  const deployChainlinkPriceOracle = async () => {
    const daiAddress = MAINNET_ADDRESSES.get(SYMBOLS.DAI);
    if (!daiAddress) {
      throw new Error("Address for DAI is not found.");
    }

    const daiEthFeedAddress = CHAINLINK_ETH_PRICE_DATA_FEEDS.MAINNET.get(
      SYMBOLS.DAI,
    );
    if (!daiEthFeedAddress) {
      throw new Error("Address for DAI/ETH price feed is not found.");
    }

    const usdcAddress = MAINNET_ADDRESSES.get(SYMBOLS.USDC);
    if (!usdcAddress) {
      throw new Error("Address for USDC is not found.");
    }

    const usdcEthFeedAddress = CHAINLINK_ETH_PRICE_DATA_FEEDS.MAINNET.get(
      SYMBOLS.USDC,
    );
    if (!usdcEthFeedAddress) {
      throw new Error("Address for USDC/ETH price feed is not found.");
    }

    const chainLinkProxyPriceProviderFactory =
      await hre.ethers.getContractFactory("ChainLinkProxyPriceProvider");
    return chainLinkProxyPriceProviderFactory.deploy(
      [daiAddress, usdcAddress],
      [daiEthFeedAddress, usdcEthFeedAddress],
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

    // Initialize lending pool core
    await lendingPoolCore.initialize(addressesProvider);

    // Initialize lending pool
    await lendingPool.initialize(addressesProvider);

    // Initialize data provider
    await lendingPoolDataProvider.initialize(addressesProvider);
  };

  await setup();

  const deployATokens = async () => {
    const tokenList = getTokenListForNetwork(hre.network);

    const tokenPrefix = "a";

    const ethAddress = tokenList.get("ETH");
    const usdcAddress = tokenList.get("USDC");
    const daiAddress = tokenList.get("DAI");

    if (!ethAddress || !usdcAddress || !daiAddress) {
      throw new Error(
        `One of the token addresses is missing: \nETH: ${ethAddress}\nUSDC: ${usdcAddress}\nDAI: ${daiAddress}\nPlease check the token list in 'lib/utils/token.ts`,
      );
    }

    const [ethDecimals, usdcDecimals, daiDecimals] = [
      TOKEN_DECIMALS.get("ETH"),
      TOKEN_DECIMALS.get("USDC"),
      TOKEN_DECIMALS.get("DAI"),
    ];
    if (!ethDecimals || !usdcDecimals || !daiDecimals) {
      throw new Error(
        `One of the token decimals is missing: \nETH: ${ethDecimals}\nUSDC: ${usdcDecimals}\nDAI: ${daiDecimals}\nPlease check the token decimals in 'lib/constants/tokens.ts`,
      );
    }

    const TOKENS: ATokenInfo[] = [
      {
        symbol: "ETH",
        name: "Liquorice interest bearing ETH",
        underlyingAssetAddress: ethAddress,
        decimals: ethDecimals,
      },
      {
        symbol: "USDC",
        name: "Liquorice interest bearing USDC",
        underlyingAssetAddress: usdcAddress,
        decimals: usdcDecimals,
      },
      {
        symbol: "DAI",
        name: "Liquorice interest bearing DAI",
        underlyingAssetAddress: daiAddress,
        decimals: daiDecimals,
      },
    ];

    const aTokensPerSymbol: Map<string, AToken> = new Map<string, AToken>();
    const aTokensPerAddress: Map<string, AToken> = new Map<string, AToken>();

    for (const token of TOKENS) {
      const name = `${tokenPrefix}${token.symbol}`;
      const aTokenFactory = await hre.ethers.getContractFactory("AToken");
      const aToken = await aTokenFactory.deploy(
        addressesProvider,
        token.underlyingAssetAddress,
        token.decimals,
        token.name,
        token.symbol,
      );

      const address = await aToken.getAddress();

      aTokensPerSymbol.set(name, aToken);
      aTokensPerAddress.set(address, aToken);
    }

    return { aTokensPerSymbol, aTokensPerAddress };
  };

  const { aTokensPerSymbol, aTokensPerAddress } = await deployATokens();

  const deployInterestRateStrategies = async () => {
    const tokenList = getTokenListForNetwork(hre.network);

    const ethAddress = tokenList.get("ETH");
    const usdcAddress = tokenList.get("USDC");
    const daiAddress = tokenList.get("DAI");

    if (!ethAddress || !usdcAddress || !daiAddress) {
      throw new Error(
        `One of the token addresses is missing: \nETH: ${ethAddress}\nUSDC: ${usdcAddress}\nDAI: ${daiAddress}\nPlease check the token list in 'lib/utils/token.ts`,
      );
    }

    const strategyInfoList = [
      {
        tokenSymbol: "ETH",
        tokenAddress: ethAddress,
        strategy: STRATEGY_VOLATILE_ONE,
      },
      {
        tokenSymbol: "USDC",
        tokenAddress: usdcAddress,
        strategy: STRATEGY_VOLATILE_ONE,
      },
      {
        tokenSymbol: "DAI",
        tokenAddress: daiAddress,
        strategy: STRATEGY_VOLATILE_ONE,
      },
    ];

    const interestRateStrategies = new Map<
      string,
      DefaultReserveInterestRateStrategy
    >();
    for (const strategyInfo of strategyInfoList) {
      const { tokenSymbol, tokenAddress, strategy } = strategyInfo;
      const name = `${tokenSymbol}InterestRateStrategy`;

      const interestRateStrategyFactory = await hre.ethers.getContractFactory(
        "DefaultReserveInterestRateStrategy",
      );
      const interestRateStrategy = await interestRateStrategyFactory.deploy(
        tokenAddress,
        addressesProvider,
        // TODO: consider reworking with big number
        `0x${strategy.baseVariableBorrowRate.toString(16)}`,
        `0x${strategy.variableRateSlope1.toString(16)}`,
        `0x${strategy.variableRateSlope2.toString(16)}`,
      );

      interestRateStrategies.set(name, interestRateStrategy);
    }

    return interestRateStrategies;
  };

  const interestRateStrategies = await deployInterestRateStrategies();

  const initReserves = async () => {
    const tokenList = getTokenListForNetwork(hre.network);

    const ethAddress = tokenList.get("ETH");
    const usdcAddress = tokenList.get("USDC");
    const daiAddress = tokenList.get("DAI");

    if (!ethAddress || !usdcAddress || !daiAddress) {
      throw new Error(
        `One of the token addresses is missing: \nETH: ${ethAddress}\nUSDC: ${usdcAddress}\nDAI: ${daiAddress}\nPlease check the token list in 'lib/utils/token.ts`,
      );
    }

    const [
      ethInterestRateStrategy,
      usdcInterestRateStrategy,
      daiInterestRateStrategy,
    ] = [
      interestRateStrategies.get("ETHInterestRateStrategy"),
      interestRateStrategies.get("USDCInterestRateStrategy"),
      interestRateStrategies.get("DAIInterestRateStrategy"),
    ];

    if (
      !ethInterestRateStrategy ||
      !usdcInterestRateStrategy ||
      !daiInterestRateStrategy
    ) {
      throw new Error(
        `One of the interest rate strategies is missing: \nETH: ${ethInterestRateStrategy}\nUSDC: ${usdcInterestRateStrategy}\nDAI: ${daiInterestRateStrategy}\nPlease check the interest rate strategies in 'lib/test/scenarios/common.ts`,
      );
    }

    const [aETH, aUSDC, aDAI] = [
      aTokensPerSymbol.get("aETH"),
      aTokensPerSymbol.get("aUSDC"),
      aTokensPerSymbol.get("aDAI"),
    ];

    if (!aETH || !aUSDC || !aDAI) {
      throw new Error(
        `One of the aTokens is missing: \nETH: ${aETH}\nUSDC: ${aUSDC}\nDAI: ${aDAI}\nPlease check the aTokens in 'lib/test/scenarios/common.ts`,
      );
    }

    const reservesList = [
      {
        tokenSymbol: "ETH",
        tokenAddress: ethAddress,
        strategy: ethInterestRateStrategy,
        aToken: aETH,
      },
      {
        tokenSymbol: "USDC",
        tokenAddress: usdcAddress,
        strategy: usdcInterestRateStrategy,
        aToken: aUSDC,
      },
      {
        tokenSymbol: "DAI",
        tokenAddress: daiAddress,
        strategy: daiInterestRateStrategy,
        aToken: aDAI,
      },
    ];

    for (const reserveInfo of reservesList) {
      const { tokenAddress, strategy, aToken } = reserveInfo;

      const decimals = await aToken.decimals();

      await lendingPoolCore.initReserve(
        tokenAddress,
        aToken,
        decimals,
        strategy,
      );

      await lendingPoolCore.enableReserveAsCollateral(tokenAddress);
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
