import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getTokenListForNetwork } from "../../lib/utils/token";
import { writeToJSON } from "../../lib/test/utils";
import { STRATEGY_VOLATILE_ONE } from "../../lib/constants/reserves";

const setupFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deployments } = hre;

  const tokenList = getTokenListForNetwork(hre.network);

  const strategyInfoList = [
    {
      // TODO: refactor to use SYMBOLS constant
      tokenSymbol: "ETH",
      tokenAddress: tokenList.get("ETH"),
      strategy: STRATEGY_VOLATILE_ONE,
    },
    {
      tokenSymbol: "USDC",
      tokenAddress: tokenList.get("USDC"),
      strategy: STRATEGY_VOLATILE_ONE,
    },
    {
      tokenSymbol: "DAI",
      tokenAddress: tokenList.get("DAI"),
      strategy: STRATEGY_VOLATILE_ONE,
    },
  ];

  const addressesProvider = await deployments.get("AddressesProvider");

  for (const strategyInfo of strategyInfoList) {
    const { tokenSymbol, tokenAddress, strategy } = strategyInfo;
    const name = `${tokenSymbol}InterestRateStrategy`;
    const deployment = await deployments.deploy(name, {
      contract:
        "contracts/DefaultReserveInterestRateStrategy.sol:DefaultReserveInterestRateStrategy",
      from: deployer,
      log: true,
      args: [
        tokenAddress,
        addressesProvider.address,
        `0x${strategy.baseVariableBorrowRate.toString(16)}`,
        `0x${strategy.variableRateSlope1.toString(16)}`,
        `0x${strategy.variableRateSlope2.toString(16)}`,
      ],
    });

    await writeToJSON("./deploy.config.json", {
      [name]: deployment.address,
    });
  }
};

setupFunction.tags = ["reserves", "interest-rate-strategy", "token-actions"];

export default setupFunction;
