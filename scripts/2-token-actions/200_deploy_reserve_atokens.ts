import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {getTokenListForNetwork} from "../../lib/utils/token";

type ATokenInfo = {
    symbol: string;
    name: string;
    underlyingAssetAddress: string;
    decimals: number;
}

const setupFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();
    const { deployments } = hre;

    const tokenList = getTokenListForNetwork(hre.network);

    const TOKENS: ATokenInfo[] = [{
        symbol: 'aETH',
        name: 'Liquorice interest bearing ETH',
        underlyingAssetAddress: tokenList.ETH.address,
        decimals: tokenList.ETH.decimals
    }, {
        symbol: 'aUSDC',
        name: 'Liquorice interest bearing USDC',
        underlyingAssetAddress: tokenList.USDC.address,
        decimals: tokenList.USDC.decimals,
    }, {
        symbol: 'aDAI',
        name: 'Liquorice interest bearing DAI',
        underlyingAssetAddress: tokenList.DAI.address,
        decimals: tokenList.DAI.decimals,
    }];

    const addressesProvider = await deployments.get('AddressesProvider');

    for (const token of TOKENS) {
        await deployments.deploy(`${token.symbol}`, {
            contract: 'contracts/token/AToken.sol:AToken',
            from: deployer,
            log: true,
            args: [
                addressesProvider.address,
                token.underlyingAssetAddress,
                token.decimals,
                token.name,
                token.symbol
            ],
        });
    }
};

setupFunction.tags = ['atokens', 'token-actions'];

export default setupFunction;
