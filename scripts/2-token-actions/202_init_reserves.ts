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
            tokenAddress: tokenList.ETH,
            strategy: await deployments.get('ETHInterestRateStrategy'),
            aToken: await deployments.get('aETH'),
        },
        {
            tokenSymbol: 'USDC',
            tokenAddress: tokenList.USDC,
            strategy: await deployments.get('USDCInterestRateStrategy'),
            aToken: await deployments.get('aUSDC'),
        },
        {
            tokenSymbol: 'DAI',
            tokenAddress: tokenList.DAI,
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
};

setupFunction.tags = ['reserves', 'interest-rate-strategy', 'token-actions'];

export default setupFunction;
