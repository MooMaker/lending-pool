// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

/*
 @title IPriceOracleGetter interface
 @notice Interface for the price oracle.
*/
interface IPriceOracleGetter {
    /***********
    @dev returns the asset price in ETH
     */
    function getAssetPrice(address _asset) external view returns (uint256);
}
