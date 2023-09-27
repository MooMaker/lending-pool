import hre from 'hardhat';
import { setBalance, time } from "@nomicfoundation/hardhat-network-helpers";

import {
    convertToCurrencyDecimals,
    getReserveAddressFromSymbol,
    getReserveData, getUserData,
    getWhaleAddressForToken
} from "../helpers";
import {getEnvironment, setupContracts} from "./common";
import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {ETH as ETH_ADDRESS} from "../../constants/tokens";
import {ContractTransactionResponse} from "../../../../../dev/ethers.js";
import {calcExpectedReserveDataAfterDeposit} from "../calculations";

export const transfer = async (reserveSymbol: string, amount: string, user: string) => {
    const { tokens } = await loadFixture(getEnvironment);

    const reserve = await getReserveAddressFromSymbol(reserveSymbol);

    if (ETH_ADDRESS === reserve.toLowerCase()) {
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
    const { tokens } = await loadFixture(getEnvironment);
    const { lendingPoolCore } = await loadFixture(setupContracts);

    const reserve = await getReserveAddressFromSymbol(reserveSymbol);

    if (ETH_ADDRESS === reserve) {
        throw 'Cannot mint ethereum. Mint action is most likely not needed in this story';
    }

    const tokenContract = tokens[reserveSymbol];

    const user = await hre.ethers.getSigner(userAddress);
    const lendingPoolCoreAddress = await lendingPoolCore.getAddress();
    await tokenContract.connect(user)
        .approve(
            lendingPoolCoreAddress,
            '100000000000000000000000000000'
        );
};

export const deposit = async (
    reserveSymbol: string,
    amount: string,
    userAddress: string,
    sendValue: string | undefined,
    expectedResult: string,
    revertMessage?: string
) => {
    const { lendingPool, lendingPoolCore } = await loadFixture(setupContracts);

    const reserve = await getReserveAddressFromSymbol(reserveSymbol);

    const amountToDeposit = convertToCurrencyDecimals(reserveSymbol, amount);

    const {
        reserveData: reserveDataBefore,
        userData: userDataBefore
    } = await getContractsData(
        reserve,
        userAddress
    );

    // TODO: I'm not sure if I'm using this correctly.
    //  If I wont load environment, tokens wont have balances and allowances
    await loadFixture(getEnvironment);

    let txOptions = {
        value: 0n,
    };
    if (ETH_ADDRESS === reserve) {
        if (sendValue) {
            txOptions.value = convertToCurrencyDecimals(reserveSymbol, sendValue);
        } else {
            txOptions.value = amountToDeposit;
        }
    }

    const user = await hre.ethers.getSigner(userAddress);

    if (expectedResult === 'success') {
        const txResult = await lendingPool
            .connect(user)
            .deposit(reserve, amountToDeposit, txOptions);

        // const {
        //     reserveData: reserveDataAfter,
        //     userData: userDataAfter,
        //     timestamp,
        // } = await getContractsData(reserve, userAddress);

        // const { txCost, txTimestamp} = await getTxCostAndTimestamp(txResult);

        // const expectedReserveData = calcExpectedReserveDataAfterDeposit(
        //     amountToDeposit,
        //     reserveDataBefore,
        //     txTimestamp
        // );
        //
        // const expectedUserReserveData = calcExpectedUserDataAfterDeposit(
        //     amountToDeposit,
        //     reserveDataBefore,
        //     expectedReserveData,
        //     userDataBefore,
        //     txTimestamp,
        //     timestamp,
        //     txCost
        // );
        //
        // expectEqual(reserveDataAfter, expectedReserveData);
        // expectEqual(userDataAfter, expectedUserReserveData);
        //
        // truffleAssert.eventEmitted(txResult, 'Deposit', (ev: any) => {
        //     const {_reserve, _user, _amount} = ev;
        //     return (
        //         _reserve === reserve &&
        //         _user === user &&
        //         new BigNumber(_amount).isEqualTo(new BigNumber(amountToDeposit))
        //     );
        // });
    } else if (expectedResult === 'revert') {
        // await expectRevert(
        //     lendingPoolInstance.deposit(reserve, amountToDeposit, '0', txOptions),
        //     revertMessage
        // );
    }
};

const getTxCostAndTimestamp = async (tx: ContractTransactionResponse) => {
    const receipt = await tx.wait();

    let txCost;
    let txTimestamp;
    if (receipt) {
        const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
        if (!block) {
            throw `Tx ${tx.hash} not in block`;
        }

        txTimestamp = block.timestamp;
        txCost = receipt.cumulativeGasUsed * receipt.gasPrice;
    } else {
        throw `Tx ${tx.hash} has no receipt`;
    }

    return {txCost, txTimestamp};
};

const getContractsData = async (reserve: string, user: string) => {
    const { lendingPool, lendingPoolCore } = await loadFixture(setupContracts);

    const [reserveData, userData, timestamp] = await Promise.all([
        getReserveData(lendingPool, reserve),
        getUserData(
            lendingPool,
            lendingPoolCore,
            reserve,
            user,
        ),
        time.latest(),
    ]);

    return {
        reserveData,
        userData,
        timestamp: BigInt(timestamp),
    };
};
