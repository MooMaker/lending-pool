import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { writeToJSON } from "../../lib/test/utils";

const deployFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const name = "LendingPoolCore";
  const deployment = await deploy(name, {
    contract: "contracts/LendingPoolCore.sol:LendingPoolCore",
    from: deployer,
    log: true,
    args: [],
    libraries: {
      CoreLibrary: (await hre.deployments.get("CoreLibrary")).address,
    },
  });

  await writeToJSON("./deploy.config.json", {
    [name]: deployment.address,
  });
};

deployFunction.tags = [];

export default deployFunction;
