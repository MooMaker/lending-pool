import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// 100% goes to deployer
const REWARD_DISTRIBUTION = [100];
const setupFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();

  const txSettings = {
    from: deployer,
    log: true,
  };

  await hre.deployments.execute(
    "TokenDistributor",
    txSettings,
    "initialize",
    [deployer],
    REWARD_DISTRIBUTION,
  );
};

setupFunction.tags = [];

export default setupFunction;
