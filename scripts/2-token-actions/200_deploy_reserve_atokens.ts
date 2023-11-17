import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getTokenListForNetwork } from "../../lib/utils/token";
import { writeToJSON } from "../../lib/test/utils";
import { SYMBOLS, TOKEN_DECIMALS } from "../../lib/constants/tokens";

export type ATokenInfo = {
  symbol: string;
  name: string;
  underlyingAssetAddress: string;
  decimals: number;
};

const TOKENS = [SYMBOLS.ETH, SYMBOLS.DAI, SYMBOLS.USDC, SYMBOLS.LINK];

const setupFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deployments } = hre;

  const addressesProvider = await deployments.get("AddressesProvider");

  const tokenList = getTokenListForNetwork(hre.network);

  const tokenPrefix = "a";
  for (const symbol of TOKENS) {
    const reserveAddress = tokenList.get(symbol);
    if (!reserveAddress) {
      throw `Token ${symbol} is missing from the token list`;
    }

    const decimals = TOKEN_DECIMALS.get(symbol);
    if (!decimals) {
      throw `Token ${symbol} is missing from the token decimals`;
    }

    const tokenName = `Liquorice interest bearing ${symbol}`;
    const aTokenSymbol = `${tokenPrefix}${symbol}`;

    const deployment = await deployments.deploy(aTokenSymbol, {
      contract: "contracts/token/AToken.sol:AToken",
      from: deployer,
      log: true,
      args: [
        addressesProvider.address,
        reserveAddress,
        decimals,
        tokenName,
        aTokenSymbol,
      ],
    });

    await writeToJSON("./deploy.config.json", {
      [aTokenSymbol]: deployment.address,
      [symbol]: reserveAddress,
    });
  }
};

setupFunction.tags = [];

export default setupFunction;
