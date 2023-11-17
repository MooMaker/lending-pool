import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { writeToJSON } from "../../lib/test/utils";
import { getTokenListForNetwork } from "../../lib/utils/token";
import { SYMBOLS } from "../../lib/constants/tokens";
import { getChainlinkDataFeedsForNetwork } from "../../lib/utils/oracle";

// Tokens to follow feeds of
const TOKENS = [SYMBOLS.DAI, SYMBOLS.USDC, SYMBOLS.LINK];

const deployFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const tokenList = getTokenListForNetwork(hre.network);
  const dataFeeds = getChainlinkDataFeedsForNetwork(hre.network);

  const reserveAddresses = [];
  const dataFeedAddresses = [];

  for (const tokenSymbol of TOKENS) {
    const reserveAddress = tokenList.get(tokenSymbol);
    if (!reserveAddress) {
      throw `Token ${tokenSymbol} is missing from the token list`;
    }

    const dataFeedAddress = dataFeeds.get(tokenSymbol);
    if (!dataFeedAddress) {
      throw `Token ${tokenSymbol} is missing from the data feed list`;
    }

    reserveAddresses.push(reserveAddress);
    dataFeedAddresses.push(dataFeedAddress);
  }

  const name = "ChainLinkProxyPriceProvider";
  const deployment = await deploy(name, {
    contract:
      "contracts/misc/ChainlinkProxyPriceProvider.sol:ChainLinkProxyPriceProvider",
    from: deployer,
    log: true,
    args: [reserveAddresses, dataFeedAddresses],
  });

  await writeToJSON("./deploy.config.json", {
    [name]: deployment.address,
  });
};

deployFunction.tags = [];

export default deployFunction;
