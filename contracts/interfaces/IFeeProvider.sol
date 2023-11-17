// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

/************
@title IFeeProvider interface
@notice Interface for the Aave fee provider.
*/

interface IFeeProvider {
    function calculateLoanOriginationFee(
        address _user,
        uint256 _amount
    ) external view returns (uint256);

    function getLoanOriginationFeePercentage() external view returns (uint256);
}
