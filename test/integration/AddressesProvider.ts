import { ethers } from "hardhat";
import {
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {expect} from "chai";

describe.skip('AddressesProvider', function () {
    async function deployContractFixtures() {
        const [owner, otherAccount] = await ethers.getSigners();

        const AddressesProvider = await ethers.getContractFactory('AddressesProvider');
        const addressesProvider = await AddressesProvider.deploy();
        const lendingPoolAddress = ethers.getCreateAddress({
            from: owner.address,
            nonce: await owner.getNonce() + 1
        })
        await addressesProvider.setLendingPoolImpl(lendingPoolAddress);

        const LendingPool = await ethers.getContractFactory('LendingPool');
        const lendingPool = await LendingPool.deploy(addressesProvider)

        const lendingPoolCoreAddress = ethers.getCreateAddress({
            from: owner.address,
            nonce: await owner.getNonce() + 1
        });
        await addressesProvider.setLendingPoolCoreImpl(lendingPoolCoreAddress);

        const LendingPoolCore = await ethers.getContractFactory('LendingPoolCore');
        const lendingPoolCore = await LendingPoolCore.deploy(addressesProvider);

        return { addressesProvider, lendingPoolCore,  lendingPool, owner, otherAccount };
    }

    it('ensures lending pool address', async () => {
        const { addressesProvider, lendingPool, lendingPoolCore } = await loadFixture(deployContractFixtures);
        expect(await addressesProvider.getLendingPool())
            .to.equal(await lendingPool.getAddress());

        expect(await addressesProvider.getLendingPoolCore())
            .to.equal(await lendingPoolCore.getAddress());
    })
});
