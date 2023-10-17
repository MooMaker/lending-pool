import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getTokenListForNetwork } from "../../lib/utils/token";
import { writeToJSON } from "../../lib/test/utils";
import { TOKEN_DECIMALS } from "../../lib/constants/tokens";

export type ATokenInfo = {
  symbol: string;
  name: string;
  underlyingAssetAddress: string;
  decimals: number;
};

const setupFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deployments } = hre;

  const tokenList = getTokenListForNetwork(hre.network);
  const ethAddress = tokenList.get("ETH");
  const usdcAddress = tokenList.get("USDC");
  const daiAddress = tokenList.get("DAI");

  if (!ethAddress || !usdcAddress || !daiAddress) {
    throw `One of the token addresses is missing: \nETH: ${ethAddress}\nUSDC: ${usdcAddress}\nDAI: ${daiAddress}\nPlease check the token list in 'lib/utils/token.ts`;
  }

  const [ethDecimals, usdcDecimals, daiDecimals] = [
    TOKEN_DECIMALS.get("ETH"),
    TOKEN_DECIMALS.get("USDC"),
    TOKEN_DECIMALS.get("DAI"),
  ];
  if (!ethDecimals || !usdcDecimals || !daiDecimals) {
    throw `One of the token decimals is missing: \nETH: ${ethDecimals}\nUSDC: ${usdcDecimals}\nDAI: ${daiDecimals}\nPlease check the token decimals in 'lib/constants/tokens.ts`;
  }

  const tokenPrefix = "a";

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
      decimals: usdcDecimals,
    },
  ];

  const addressesProvider = await deployments.get("AddressesProvider");

  for (const token of TOKENS) {
    const name = `${tokenPrefix}${token.symbol}`;
    const deployment = await deployments.deploy(name, {
      contract: "contracts/token/AToken.sol:AToken",
      from: deployer,
      log: true,
      args: [
        addressesProvider.address,
        token.underlyingAssetAddress,
        token.decimals,
        token.name,
        token.symbol,
      ],
    });

    await writeToJSON("./deploy.config.json", {
      [name]: deployment.address,
      [token.symbol]: token.underlyingAssetAddress,
    });
  }
};

setupFunction.tags = ["atokens", "token-actions"];

export default setupFunction;
