import hre from 'hardhat';
import { setBalance, time } from "@nomicfoundation/hardhat-network-helpers";

import {
    convertToCurrencyDecimals,
    getReserveAddressFromSymbol,
    getReserveData, getUserData,
    getWhaleAddressForToken
} from "../helpers";
import {ETH as ETH_ADDRESS} from "../../constants/tokens";
import {ContractTransactionResponse} from "../../../../../dev/ethers.js";
import {calcExpectedReserveDataAfterDeposit, calcExpectedUserDataAfterDeposit} from "../calculations";
import {ReserveData, UserReserveData} from "../../types";
import {expect} from "chai";
import {AToken, LendingPool, LendingPoolCore} from "../../../typechain-types";
import {getEnvironment} from "./common";

type ActionsConfig = {
    contracts: {
        lendingPool?: LendingPool;
        lendingPoolCore?: LendingPoolCore;
        aTokensPerAddress: {
            [key: string]: AToken;
        }
        aTokensPerSymbol: {
            [key: string]: AToken;
        }
    }
    ethereumAddress: string;
    skipIntegrityCheck: boolean;
}

let _config: ActionsConfig = {
    contracts: {
        aTokensPerSymbol: {},
        aTokensPerAddress: {},
    },
    ethereumAddress: ETH_ADDRESS,
    skipIntegrityCheck: false
};

export const setConfig = (config: ActionsConfig) => {
    _config = config;
}

export const getConfig = () => {
    return _config;
}

export const transfer = async (reserveSymbol: string, amount: string, user: string) => {
    const { tokensPerAddress } = await getEnvironment();

    const reserve = await getReserveAddressFromSymbol(reserveSymbol);

    if (ETH_ADDRESS === reserve.toLowerCase()) {
        throw 'Cannot mint ethereum. Mint action is most likely not needed in this story';
    }

    const tokenContract = tokensPerAddress.get(reserve);
    if (!tokenContract) {
        throw `Token contract not found for ${reserveSymbol}`;
    }

    const whaleAddress = getWhaleAddressForToken(reserveSymbol);

    const whale = await hre.ethers
        .getImpersonatedSigner(whaleAddress)
    // Fund whale to pay for gas
    await setBalance(whaleAddress, hre.ethers.parseEther("1"));

    const whaleTokenBalance = await tokenContract.balanceOf(whaleAddress);

    const tokensToTransfer = convertToCurrencyDecimals(reserveSymbol, amount);
    const tokenDecimals = await tokenContract.decimals();

    console.log(`[Action: Transfer] Whale ${whaleAddress} with balance ${hre.ethers.formatUnits(whaleTokenBalance, tokenDecimals)} transfers ${amount} ${reserveSymbol} to ${user}`);
    await tokenContract.connect(whale).transfer(user, tokensToTransfer);

    const userBalance = await tokenContract.balanceOf(user);
    console.log(`[Action: Transfer] User ${user} balance after transfer ${hre.ethers.formatUnits(userBalance, tokenDecimals)}`);
};

export const approve = async (reserveSymbol: string, userAddress: string) => {
    const { tokens } = await getEnvironment();
    const { lendingPoolCore } = _config.contracts;

    if (!lendingPoolCore) {
        throw 'Lending pool core is not set in configuration';
    }

    const reserve = await getReserveAddressFromSymbol(reserveSymbol);

    if (ETH_ADDRESS === reserve) {
        throw 'Cannot mint ethereum. Mint action is most likely not needed in this story';
    }

    const tokenContract = tokens.get(reserveSymbol);
    if (!tokenContract) {
        throw `Token contract not found for ${reserveSymbol}`;
    }

    const user = await hre.ethers.getSigner(userAddress);
    const userBalance = await tokenContract.balanceOf(userAddress);
    const tokenDecimals = await tokenContract.decimals();

    const lendingPoolCoreAddress = await lendingPoolCore.getAddress();

    console.log(`[Action: Approve] User ${userAddress} with balance ${hre.ethers.formatUnits(userBalance, tokenDecimals)} ${reserveSymbol} approves spending to core ${lendingPoolCoreAddress}`);
    await tokenContract.connect(user)
        .approve(
            lendingPoolCoreAddress,
            '100000000000000000000000000000'
        );
    const allowance = await tokenContract.allowance(userAddress, lendingPoolCoreAddress);
    console.log(`[Action: Approve] Contract ${lendingPoolCoreAddress} allowance is now ${hre.ethers.formatUnits(allowance, tokenDecimals)}`);
};

export const deposit = async (
    reserveSymbol: string,
    amount: string,
    userAddress: string,
    sendValue: string | undefined,
    expectedResult: string,
    revertMessage?: string
) => {
    const { lendingPool, lendingPoolCore } = _config.contracts;
    const { tokens } = await getEnvironment();

    const tokenContract = tokens.get(reserveSymbol);
    if (!tokenContract) {
        throw `Token contract not found for ${reserveSymbol}`;
    }

    if (!lendingPool) {
        throw 'Lending pool is not set in configuration';
    }

    if (!lendingPoolCore) {
        throw 'Lending pool core is not set in configuration';
    }

    const reserve = await getReserveAddressFromSymbol(reserveSymbol);

    const amountToDeposit = convertToCurrencyDecimals(reserveSymbol, amount);

    const {
        reserveData: reserveDataBefore,
        userData: userDataBefore
    } = await getContractsData(
        reserve,
        userAddress
    );

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
    const balance = await tokenContract.balanceOf(userAddress);
    const decimals = await tokenContract.decimals();

    console.log(`[Action: Deposit] User ${userAddress} with balance of ${hre.ethers.formatUnits(balance, decimals)} ${reserveSymbol} deposits ${amount} ${reserveSymbol} to the pool`);
    if (expectedResult === 'success') {
        const { tokens } = await getEnvironment();
        const dai = tokens.get('DAI');
        if (!dai) {
            throw 'DAI token not found in environment';
        }

        console.log('[Before] User balance', await dai.balanceOf(userAddress));
        // TODO: magically passes if user has no balance???
        const txResult = await lendingPool
            .connect(user)
            .deposit(reserve, amountToDeposit, 0, txOptions);

        console.log('[After] User balance', await dai.balanceOf(userAddress));

        const {
            reserveData: reserveDataAfter,
            userData: userDataAfter,
            timestamp,
        } = await getContractsData(reserve, userAddress);

        const { txCost, txTimestamp} = await getTxCostAndTimestamp(txResult);

        const expectedReserveData = calcExpectedReserveDataAfterDeposit(
            amountToDeposit,
            reserveDataBefore,
            txTimestamp
        );

        const expectedUserReserveData = calcExpectedUserDataAfterDeposit(
            amountToDeposit,
            reserveDataBefore,
            expectedReserveData,
            userDataBefore,
            txTimestamp,
            timestamp,
            txCost
        );

        console.log({
            reserveDataAfter,
        })

        console.log({
            expectedReserveData,
        })

        expect(reserveDataAfter)
            .to.contain(expectedReserveData);

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
    const { lendingPool, lendingPoolCore } = _config.contracts;

    if (!lendingPool) {
        throw 'Lending pool is not set in configuration';
    }

    if (!lendingPoolCore) {
        throw 'Lending pool core is not set in configuration';
    }

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

const expectEqual = (
    actual: UserReserveData | ReserveData,
    expected: UserReserveData | ReserveData
) => {
    // TODO: add integrity check?
    // if (!configuration.skipIntegrityCheck) {
    //     expect(actual).to.be.almostEqualOrEqual(expected);
    expect(actual).to.be.deep.equal(expected);
    // }
};
