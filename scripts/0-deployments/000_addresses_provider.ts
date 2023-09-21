import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy('AddressesProvider', {
    contract: 'contracts/configuration/AddressesProvider.sol:AddressesProvider',
    from: deployer,
    log: true,
    args: [],
  });
};

deployFunction.tags = ['addresses-provider', 'base-contracts'];

export default deployFunction;
