import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const deployFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const name = "LendingPoolCore";
  await deploy(name, {
    contract: "contracts/LendingPoolCore.sol:LendingPoolCore",
    from: deployer,
    log: true,
    args: [],
    libraries: {
      CoreLibrary: (await hre.deployments.get("CoreLibrary")).address,
    },
  });
};

deployFunction.tags = [];

export default deployFunction;
