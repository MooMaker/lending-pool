import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getTokenListForNetwork } from "../../lib/utils/token";
import { writeToJSON } from "../../lib/test/utils";
import { STRATEGY_VOLATILE_ONE } from "../../lib/constants/reserves";
import { SYMBOLS } from "../../lib/constants/tokens";
import { getDeployOutputFileName } from "../../lib/deploy/utils";

const TOKEN_STRATEGIES = {
  [SYMBOLS.ETH]: STRATEGY_VOLATILE_ONE,
  [SYMBOLS.USDC]: STRATEGY_VOLATILE_ONE,
  [SYMBOLS.DAI]: STRATEGY_VOLATILE_ONE,
  [SYMBOLS.LINK]: STRATEGY_VOLATILE_ONE,
};

const setupFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deployments } = hre;

  const addressesProvider = await deployments.get("AddressesProvider");

  const tokenList = getTokenListForNetwork(hre.network);

  const entries = Object.entries(TOKEN_STRATEGIES);
  for (const [symbol, strategy] of entries) {
    const reserveAddress = tokenList.get(symbol);
    if (!reserveAddress) {
      throw `Token ${symbol} is missing from the token list`;
    }

    const name = `${symbol}InterestRateStrategy`;
    const deployment = await deployments.deploy(name, {
      contract:
        "contracts/DefaultReserveInterestRateStrategy.sol:DefaultReserveInterestRateStrategy",
      from: deployer,
      log: true,
      args: [
        reserveAddress,
        addressesProvider.address,
        `0x${strategy.baseVariableBorrowRate.toString(16)}`,
        `0x${strategy.variableRateSlope1.toString(16)}`,
        `0x${strategy.variableRateSlope2.toString(16)}`,
      ],
    });

    await writeToJSON(`./${getDeployOutputFileName(hre.network.name)}`, {
      [name]: deployment.address,
    });
  }
};

setupFunction.tags = [];

export default setupFunction;
