import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy('LendingPool', {
    contract: 'contracts/LendingPool.sol:LendingPool',
    from: deployer,
    log: true,
    args: [],
  });
};

deployFunction.tags = ['lending-pool', 'client-contracts'];

export default deployFunction;
