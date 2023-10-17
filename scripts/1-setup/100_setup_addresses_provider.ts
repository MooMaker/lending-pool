import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const setupFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deployments } = hre;

  const txSettings = {
    from: deployer,
    log: true,
  };

  const lendingPoolCore = await deployments.get("LendingPoolCore");
  const lendingPool = await deployments.get("LendingPool");

  await hre.deployments.execute(
    "AddressesProvider",
    txSettings,
    "setLendingPoolCoreImpl",
    lendingPoolCore.address,
  );

  await hre.deployments.execute(
    "AddressesProvider",
    txSettings,
    "setLendingPoolImpl",
    lendingPool.address,
  );
};

setupFunction.tags = ["addresses-provider", "setup-base-contracts"];

export default setupFunction;
