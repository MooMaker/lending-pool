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

  const addressesProvider = await deployments.get("AddressesProvider");

  await hre.deployments.execute(
    "LendingPoolCore",
    txSettings,
    "initialize",
    addressesProvider.address,
  );
};

setupFunction.tags = ["lending-pool-core", "setup-base-contracts"];

export default setupFunction;
