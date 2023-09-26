import hre from "hardhat";
import {
    AddressesProvider,
    AToken,
    DefaultReserveInterestRateStrategy,
    IERC20,
    LendingPool,
    LendingPoolCore
} from "../../../typechain-types";
import {Network} from "hardhat/types";
import {getTokenListForNetwork} from "../../utils/token";
import {TOKEN_DECIMALS} from "../../constants/tokens";
import {ATokenInfo} from "../../../scripts/2-token-actions/200_deploy_reserve_atokens";
import {STRATEGY_VOLATILE_ONE} from "../../../scripts/2-token-actions/201_deploy_interest_rate_strategies";

export async function getEnvironment(network: Network): Promise<{
    tokens: { [key: string]: IERC20 }
}> {
    const tokenList = getTokenListForNetwork(network);

    const tokens: { [key: string]: IERC20 } = {};
    tokens['USDC'] = await hre.ethers.getContractAt('IERC20', tokenList.USDC);
    tokens['DAI'] = await hre.ethers.getContractAt('IERC20', tokenList.DAI);

    return {
        tokens
    };
}

export async function setupContracts(): Promise<{
    addressesProvider: AddressesProvider,
    lendingPool: LendingPool,
    lendingPoolCore: LendingPoolCore,
    aTokens: { [key: string]: AToken }
    interestRateStrategies: { [key: string]: DefaultReserveInterestRateStrategy }
}> {
    const deploy = async () => {
        const addressesProviderFactory = await hre.ethers.getContractFactory('AddressesProvider');
        const addressesProvider = await addressesProviderFactory.deploy();

        const lendingPoolFactory = await hre.ethers.getContractFactory('LendingPool');
        const lendingPool = await lendingPoolFactory.deploy();

        const lendingPoolCoreFactory = await hre.ethers.getContractFactory('LendingPoolCore');
        const lendingPoolCore = await lendingPoolCoreFactory.deploy();

        return {
            addressesProvider,
            lendingPool,
            lendingPoolCore
        }
    };

    const {
        addressesProvider,
        lendingPool,
        lendingPoolCore
    } = await deploy();

    const setup = async () => {
        // Setup addresses provider
        await addressesProvider.setLendingPoolCoreImpl(await lendingPoolCore.getAddress());
        await addressesProvider.setLendingPoolImpl(await lendingPool.getAddress());

        // Initialize lending pool core
        await lendingPoolCore.initialize(addressesProvider);

        // Initialize lending pool
        await lendingPool.initialize(addressesProvider);
    }

    await setup();

    const deployATokens = async () => {
        const tokenList = getTokenListForNetwork(hre.network);

        const tokenPrefix = 'a';

        const TOKENS: ATokenInfo[] = [{
            symbol: 'ETH',
            name: 'Liquorice interest bearing ETH',
            underlyingAssetAddress: tokenList.ETH,
            decimals: TOKEN_DECIMALS.ETH,
        }, {
            symbol: 'USDC',
            name: 'Liquorice interest bearing USDC',
            underlyingAssetAddress: tokenList.USDC,
            decimals: TOKEN_DECIMALS.USDC,
        }, {
            symbol: 'DAI',
            name: 'Liquorice interest bearing DAI',
            underlyingAssetAddress: tokenList.DAI,
            decimals: TOKEN_DECIMALS.DAI,
        }];

        const aTokens: { [key: string]: AToken } = {};
        for (const token of TOKENS) {
            const name = `${tokenPrefix}${token.symbol}`;
            const aTokenFactory = await hre.ethers.getContractFactory('AToken');
            const aToken = await aTokenFactory.deploy(
                addressesProvider,
                token.underlyingAssetAddress,
                token.decimals,
                token.name,
                token.symbol
            );

            aTokens[name] = aToken;
        }

        return aTokens;
    }

    const aTokens = await deployATokens();

    const deployInterestRateStrategies = async () => {
        const tokenList = getTokenListForNetwork(hre.network);

        const strategyInfoList = [
            {
                tokenSymbol: 'ETH',
                tokenAddress: tokenList.ETH,
                strategy: STRATEGY_VOLATILE_ONE,
            },
            {
                tokenSymbol: 'USDC',
                tokenAddress: tokenList.USDC,
                strategy: STRATEGY_VOLATILE_ONE,
            },
            {
                tokenSymbol: 'DAI',
                tokenAddress: tokenList.DAI,
                strategy: STRATEGY_VOLATILE_ONE,
            }
        ];

        const interestRateStrategies: { [key: string]: DefaultReserveInterestRateStrategy } = {};
        for (const strategyInfo of strategyInfoList) {
            const { tokenSymbol, tokenAddress, strategy } = strategyInfo;
            const name = `${tokenSymbol}InterestRateStrategy`;

            const interestRateStrategyFactory = await hre.ethers.getContractFactory('DefaultReserveInterestRateStrategy');
            const interestRateStrategy = await interestRateStrategyFactory.deploy(
                tokenAddress,
                addressesProvider,
                strategy.baseVariableBorrowRate,
                strategy.variableRateSlope1,
                strategy.variableRateSlope2,
            );

            interestRateStrategies[name] = interestRateStrategy;
        }

        return interestRateStrategies;
    }

    const interestRateStrategies = await deployInterestRateStrategies();

    const initReserves = async () => {
        const tokenList = getTokenListForNetwork(hre.network);

        const reservesList = [
            {
                tokenSymbol: 'ETH',
                tokenAddress: tokenList.ETH,
                strategy: interestRateStrategies['ETHInterestRateStrategy'],
                aToken: aTokens['ETH'],
            },
            {
                tokenSymbol: 'USDC',
                tokenAddress: tokenList.USDC,
                strategy: interestRateStrategies['USDCInterestRateStrategy'],
                aToken: aTokens['USDC'],
            },
            {
                tokenSymbol: 'DAI',
                tokenAddress: tokenList.DAI,
                strategy: interestRateStrategies['DAIInterestRateStrategy'],
                aToken: aTokens['DAI'],
            }
        ];

        for (const reserveInfo of reservesList) {
            const { tokenAddress, strategy, aToken } = reserveInfo;

            const decimals = await aToken.decimals();

            await lendingPoolCore.initReserve(
                tokenAddress,
                aToken,
                decimals,
                strategy
            );
        }
    }

    await initReserves();

    return {
        addressesProvider,
        lendingPool,
        lendingPoolCore,
        aTokens,
        interestRateStrategies
    }
}
