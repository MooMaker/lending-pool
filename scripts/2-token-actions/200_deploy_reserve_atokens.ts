import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {getTokenListForNetwork} from "../../lib/utils/token";

type ATokenInfo = {
    symbol: string;
    name: string;
    underlyingAssetAddress: string;
}

const setupFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployer } = await hre.getNamedAccounts();
    const { deployments } = hre;

    const tokenList = getTokenListForNetwork(hre.network);

    const TOKENS: ATokenInfo[] = [{
        symbol: 'aETH',
        name: 'Liquorice interest bearing ETH',
        underlyingAssetAddress: tokenList.ETH,
    }, {
        symbol: 'aUSDC',
        name: 'Liquorice interest bearing USDC',
        underlyingAssetAddress: tokenList.USDC
    }, {
        symbol: 'aDAI',
        name: 'Liquorice interest bearing DAI',
        underlyingAssetAddress: tokenList.DAI
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
                token.name,
                token.symbol
            ],
        });
    }
};

setupFunction.tags = ['atokens', 'token-actions'];

export default setupFunction;
