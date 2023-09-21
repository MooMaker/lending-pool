import {HardhatRuntimeEnvironment} from "hardhat/types";
import {Deployment, DeployResult} from "hardhat-deploy/dist/types";

export const verifyContract = async (hre: HardhatRuntimeEnvironment, deploy: DeployResult | Deployment, contract?: string): Promise<void> => {
    if (hre.network.config.chainId === 31337 || !hre.config.etherscan.apiKey) {
        console.log(`Skipping Etherscan verification: contract "${contract}" deployed to local network`);
        return; // contract is deployed on local network or no apiKey is configured
    }

    try {
        await hre.run('verify:verify', {
            address: deploy.address,
            contract,
            constructorArguments: deploy.args,
        });
    } catch (err: any) {
        if (err.message.includes('Reason: Already Verified')) {
            console.log('Contract is already verified!');
        } else {
            console.log(err);
        }
    }
};
