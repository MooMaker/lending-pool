import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy('LendingPoolCore', {
    contract: 'contracts/LendingPoolCore.sol:LendingPoolCore',
    from: deployer,
    log: true,
    args: [],
  });
};

deployFunction.tags = ['lending-pool-core', 'base-contracts'];

export default deployFunction;
