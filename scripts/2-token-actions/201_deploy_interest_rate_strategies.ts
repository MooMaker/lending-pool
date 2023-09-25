import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {getTokenListForNetwork} from "../../lib/utils/token";
import {writeToJSON} from "../../lib/test/utils";

type InterestRateStrategy = {
    optimalUsage: number;
    baseVariableBorrowRate: number;
    variableRateSlope1: number;
    variableRateSlope2: number;
}

const STRATEGY_VOLATILE_ONE: InterestRateStrategy = {
    optimalUsage: 45,
    baseVariableBorrowRate: 0,
    // TODO: convert properly to RAY
    variableRateSlope1: 4, // 4%
    variableRateSlope2: 300, // 300%
}

const setupFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();
    const { deployments } = hre;

    const tokenList = getTokenListForNetwork(hre.network);

    const strategyInfoList = [
        {
            tokenSymbol: 'ETH',
            tokenAddress: tokenList.ETH.address,
            strategy: STRATEGY_VOLATILE_ONE,
        },
        {
            tokenSymbol: 'USDC',
            tokenAddress: tokenList.USDC.address,
            strategy: STRATEGY_VOLATILE_ONE,
        },
        {
            tokenSymbol: 'DAI',
            tokenAddress: tokenList.DAI.address,
            strategy: STRATEGY_VOLATILE_ONE,
        }
    ];

    const addressesProvider = await deployments.get('AddressesProvider');

    for (const strategyInfo of strategyInfoList) {
        const { tokenSymbol, tokenAddress, strategy } = strategyInfo;
        const name = `${tokenSymbol}InterestRateStrategy`;
        const deployment = await deployments.deploy(name, {
            contract: 'contracts/DefaultReserveInterestRateStrategy.sol:DefaultReserveInterestRateStrategy',
            from: deployer,
            log: true,
            args: [
                tokenAddress,
                addressesProvider.address,
                strategy.baseVariableBorrowRate,
                strategy.variableRateSlope1,
                strategy.variableRateSlope2,
            ]
        });

        await writeToJSON('./deploy.config.json', {
            [name]: deployment.address,
        });
    }
};

setupFunction.tags = ['reserves', 'interest-rate-strategy', 'token-actions'];

export default setupFunction;
