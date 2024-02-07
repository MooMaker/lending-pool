import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const deployFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const name = "CoreLibrary";
  await deploy(name, {
    contract: "contracts/libraries/CoreLibrary.sol:CoreLibrary",
    from: deployer,
    log: true,
    args: [],
  });
};

deployFunction.tags = [];

export default deployFunction;
