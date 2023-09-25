import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {getTokenListForNetwork} from "../../lib/utils/token";
const setupFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();
    const { deployments } = hre;

    const tokenList = getTokenListForNetwork(hre.network);

    const reservesList = [
        {
            tokenSymbol: 'ETH',
            tokenAddress: tokenList.ETH.address,
            strategy: await deployments.get('ETHInterestRateStrategy'),
            aToken: await deployments.get('aETH'),
        },
        {
            tokenSymbol: 'USDC',
            tokenAddress: tokenList.USDC.address,
            strategy: await deployments.get('USDCInterestRateStrategy'),
            aToken: await deployments.get('aUSDC'),
        },
        {
            tokenSymbol: 'DAI',
            tokenAddress: tokenList.DAI.address,
            strategy: await deployments.get('DAIInterestRateStrategy'),
            aToken: await deployments.get('aDAI'),
        }
    ];

    for (const reserveInfo of reservesList) {
        const { tokenSymbol, tokenAddress, strategy, aToken } = reserveInfo;

        const decimals = await deployments.read(
            `a${tokenSymbol}`,
            { from: deployer },
            'decimals'
        );

        await deployments.execute(
            'LendingPoolCore',
            { from: deployer, log: true },
            'initReserve',
            ...[tokenAddress, aToken.address, decimals, strategy.address]
        )
    }

    // for (const strategyInfo of strategyInfoList) {
    //     const { tokenSymbol, tokenAddress, strategy } = strategyInfo;
    //     await deployments.deploy(`${tokenSymbol}InterestRateStrategy`, {
    //         contract: 'contracts/DefaultReserveInterestRateStrategy.sol:DefaultReserveInterestRateStrategy',
    //         from: deployer,
    //         log: true,
    //         args: [
    //             tokenAddress,
    //             addressesProvider.address,
    //             strategy.baseVariableBorrowRate,
    //             strategy.variableRateSlope1,
    //             strategy.variableRateSlope2,
    //         ]
    //     });
    // }
};

setupFunction.tags = ['reserves', 'interest-rate-strategy', 'token-actions'];

export default setupFunction;
