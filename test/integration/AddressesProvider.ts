import { ethers } from "hardhat";
import {
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {expect} from "chai";

describe('AddressesProvider', function () {
    async function deployContractFixtures() {
        const [owner, otherAccount] = await ethers.getSigners();

        const AddressesProvider = await ethers.getContractFactory('AddressesProvider');
        const addressesProvider = await AddressesProvider.deploy();
        const lendingPoolAddress = ethers.getCreateAddress({
            from: owner.address,
            nonce: await owner.getNonce() + 1
        })
        await addressesProvider.setLendingPoolImpl(lendingPoolAddress);
        //
        // const lendingPoolCoreAddress = ethers.getCreateAddress({
        //    from: owner.address,
        //    nonce: await owner.getNonce() + 1
        // });

        const LendingPool = await ethers.getContractFactory('LendingPool');
        const lendingPool = await LendingPool.deploy(lendingPoolAddress);

        // const LendingPoolCore = await ethers.getContractFactory('LendingPoolCore');
        // const lendingPoolCore = await LendingPoolCore.deploy(lendingPoolCoreAddress);

        return { addressesProvider, lendingPool, owner, otherAccount };
    }

    it('ensures lending pool address', async () => {
        const { addressesProvider, lendingPool } = await loadFixture(deployContractFixtures);
        expect(await addressesProvider.getLendingPool())
            .to.equal(await lendingPool.getAddress());
    })
});
