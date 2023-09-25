import hre from 'hardhat';
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";

import type { LendingPoolInterface } from '../../../typechain-types/contracts/LendingPool';
import type { LendingPoolCoreInterface } from '../../../typechain-types/contracts/LendingPoolCore';
import {convertToCurrencyDecimals, getReserveAddressFromSymbol, getWhaleAddressForToken} from "../helpers";

interface ActionsConfig {
    lendingPoolInstance: LendingPoolInterface;
    lendingPoolCoreInstance: LendingPoolCoreInterface;
    ethereumAddress: string;
}

export const configuration: ActionsConfig = <ActionsConfig>{};

export const transfer = async (reserveSymbol: string, amount: string, user: string) => {
    const { ethereumAddress} = configuration;

    const reserve = await getReserveAddressFromSymbol(reserveSymbol);

    if (ethereumAddress === reserve.toLowerCase()) {
        throw 'Cannot mint ethereum. Mint action is most likely not needed in this story';
    }

    const tokenContract = await hre.ethers.getContractAt('ERC20', reserve);

    const whaleAddress = getWhaleAddressForToken(reserveSymbol);
    const whale = await hre.ethers
        .getImpersonatedSigner(whaleAddress)
    await setBalance(whaleAddress, hre.ethers.parseEther("1"));

    const tokensToTransfer = convertToCurrencyDecimals(reserveSymbol, amount);

    const balance = await tokenContract.balanceOf(whaleAddress);
    await tokenContract.connect(whale).transfer(user, tokensToTransfer);
};
