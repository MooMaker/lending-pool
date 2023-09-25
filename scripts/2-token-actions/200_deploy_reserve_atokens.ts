import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {getTokenListForNetwork} from "../../lib/utils/token";
import {writeToJSON} from "../../lib/test/utils";
import {TOKEN_DECIMALS} from "../../lib/constants/tokens";

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

    const addressesProvider = await deployments.get('AddressesProvider');

    for (const token of TOKENS) {
        const name = `${tokenPrefix}${token.symbol}`;
        const deployment = await deployments.deploy(name, {
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

        await writeToJSON('./deploy.config.json', {
            [name]: deployment.address,
            [token.symbol]: token.underlyingAssetAddress
        });
    }
};

setupFunction.tags = ['atokens', 'token-actions'];

export default setupFunction;
