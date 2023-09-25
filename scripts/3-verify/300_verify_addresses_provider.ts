import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { verifyContract } from '../../lib/deploy/utils';

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const contract = await hre.deployments.get('AddressesProvider');
    await verifyContract(
        hre,
        contract,
        'contracts/configuration/AddressesProvider.sol:AddressesProvider'
    );
};

deployFunction.tags = ['verify', 'verify-addresses-provider'];

export default deployFunction;
