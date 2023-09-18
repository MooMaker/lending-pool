// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IAddressesProvider.sol";
import "./AddressStorage.sol";

contract AddressesProvider is Ownable, IAddressesProvider, AddressStorage {
    //events
    event LendingPoolUpdated(address indexed newAddress);
    event LendingPoolCoreUpdated(address indexed newAddress);

    bytes32 private constant LENDING_POOL = "LENDING_POOL";
    bytes32 private constant LENDING_POOL_CORE = "LENDING_POOL_CORE";

    /**
    * @dev returns the address of the LendingPool proxy
    * @return the lending pool proxy address
    **/
    function getLendingPool() public view returns (address) {
        return getAddress(LENDING_POOL);
    }


    /**
    * @dev updates the implementation of the lending pool
    * @param _pool the new lending pool implementation
    **/
    function setLendingPoolImpl(address _pool) public onlyOwner {
        _setAddress(LENDING_POOL, _pool);
        emit LendingPoolUpdated(_pool);
    }

    /**
    * @dev returns the address of the LendingPoolCore
    * @return the lending pool core proxy address
     */
    function getLendingPoolCore() public view returns (address payable) {
        address payable core = payable(getAddress(LENDING_POOL_CORE));
        return core;
    }

    /**
    * @dev updates the implementation of the lending pool core
    * @param _lendingPoolCore the new lending pool core implementation
    **/
    function setLendingPoolCoreImpl(address _lendingPoolCore) public onlyOwner {
        _setAddress(LENDING_POOL_CORE, _lendingPoolCore);
        emit LendingPoolCoreUpdated(_lendingPoolCore);
    }
}
