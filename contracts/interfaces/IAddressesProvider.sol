// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.18;

interface IAddressesProvider {
    function getLendingPool() external view returns (address);
    function setLendingPoolImpl(address _pool) external;

    function getLendingPoolCore() external view returns (address payable);
    function setLendingPoolCoreImpl(address _lendingPoolCore) external;
}
