import hre from 'hardhat';
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";

import deployConfigJSON from '../../../deploy.config.json';
import {convertToCurrencyDecimals, getReserveAddressFromSymbol, getWhaleAddressForToken} from "../helpers";
import {getEnvironment, setupContracts} from "./common";

interface ActionsConfig {
    lendingPoolInstanceAddress: string;
    lendingPoolCoreInstanceAddress: string;
    ethereumAddress: string;
}

export const configuration: ActionsConfig = <ActionsConfig>{
    lendingPoolCoreInstanceAddress: deployConfigJSON.LendingPoolCore,
    lendingPoolInstanceAddress: deployConfigJSON.LendingPool,
    ethereumAddress: deployConfigJSON.ETH
};

export const transfer = async (reserveSymbol: string, amount: string, user: string) => {
    const { ethereumAddress} = configuration;
    const { tokens } = await getEnvironment(hre.network);

    const reserve = await getReserveAddressFromSymbol(reserveSymbol);

    if (ethereumAddress === reserve.toLowerCase()) {
        throw 'Cannot mint ethereum. Mint action is most likely not needed in this story';
    }

    const tokenContract = tokens[reserveSymbol];

    const whaleAddress = getWhaleAddressForToken(reserveSymbol);
    const whale = await hre.ethers
        .getImpersonatedSigner(whaleAddress)
    await setBalance(whaleAddress, hre.ethers.parseEther("1"));

    const tokensToTransfer = convertToCurrencyDecimals(reserveSymbol, amount);

    await tokenContract.connect(whale).transfer(user, tokensToTransfer);
};

export const approve = async (reserveSymbol: string, userAddress: string) => {
    const { ethereumAddress} = configuration;

    const { tokens } = await getEnvironment(hre.network);

    const reserve = await getReserveAddressFromSymbol(reserveSymbol);

    if (ethereumAddress === reserve) {
        throw 'Cannot mint ethereum. Mint action is most likely not needed in this story';
    }

    const tokenContract = tokens[reserveSymbol];

    const user = await hre.ethers.getSigner(userAddress);
    await tokenContract.connect(user)
        .approve(
            configuration.lendingPoolCoreInstanceAddress,
            '100000000000000000000000000000'
        );
};
