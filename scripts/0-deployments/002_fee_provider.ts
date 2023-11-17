import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { writeToJSON } from "../../lib/test/utils";
import { getDeployOutputFileName } from "../../lib/deploy/utils";

const deployFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment,
) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const name = "FeeProvider";
  const deployment = await deploy(name, {
    contract: "contracts/fees/FeeProvider.sol:FeeProvider",
    from: deployer,
    log: true,
    args: [],
  });

  await writeToJSON(`./${getDeployOutputFileName(hre.network.name)}`, {
    [name]: deployment.address,
  });
};

deployFunction.tags = [];

export default deployFunction;
