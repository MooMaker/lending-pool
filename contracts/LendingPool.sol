// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./configuration/AddressesProvider.sol";
import "./token/AToken.sol";
import "./LendingPoolCore.sol";

contract LendingPool is ReentrancyGuard {
    AddressesProvider public addressesProvider;
    LendingPoolCore public core;

    /**
    * @dev functions affected by this modifier can only be invoked if the reserve is active
    * @param _reserve the address of the reserve
    **/
    modifier onlyActiveReserve(address _reserve) {
        requireReserveActiveInternal(_reserve);
        _;
    }

    /**
    * @dev functions affected by this modifier can only be invoked if the provided _amount input parameter
    * is not zero.
    * @param _amount the amount provided
    **/
    modifier onlyAmountGreaterThanZero(uint256 _amount) {
        requireAmountGreaterThanZeroInternal(_amount);
        _;
    }

    constructor(AddressesProvider _addressesProvider) {
        addressesProvider = _addressesProvider;
        core = LendingPoolCore(addressesProvider.getLendingPoolCore());
    }

    /**
    * @dev deposits The underlying asset into the reserve. A corresponding amount of the overlying asset (aTokens)
    * is minted.
    * @param _reserve the address of the reserve
    * @param _amount the amount to be deposited
    **/
    function deposit(address _reserve, uint256 _amount)
        external
        payable
        nonReentrant
        onlyActiveReserve(_reserve)
        // TODO: do we need it?
        // onlyUnfreezedReserve(_reserve)
        onlyAmountGreaterThanZero(_amount)
    {
        // Locate the aToken to issue to user on deposit
        AToken aToken = AToken(core.getReserveATokenAddress(_reserve));

        // TODO: do we need it?
//        bool isFirstDeposit = aToken.balanceOf(msg.sender) == 0;

        // Having in mind discrete nature of the blockchain processing, we need to update the state of the pool
        // as a result of one of the pool actions (deposit in this case) in order to calculate the correct accrued interest values
        // of the pool. They are going to be used on later stage to determine accrued interest for the user.
        core.updateStateOnDeposit(_reserve, msg.sender, _amount /*, isFirstDeposit */);

        // Minting AToken to user 1:1 with the specific exchange rate
        // Aside from that it also minting the interest to the user
        aToken.mintOnDeposit(msg.sender, _amount);

        // transfer to the core contract
        core.transferToReserve{ value: msg.value }(_reserve, payable(msg.sender), _amount);
//
//        //solium-disable-next-line
//        emit Deposit(_reserve, msg.sender, _amount, _referralCode, block.timestamp);

    }

    /**
    * @dev internal function to save on code size for the onlyActiveReserve modifier
    **/
    function requireReserveActiveInternal(address _reserve) internal view {
        require(core.getReserveIsActive(_reserve), "Action requires an active reserve");
    }

    /**
    * @notice internal function to save on code size for the onlyAmountGreaterThanZero modifier
    **/
    function requireAmountGreaterThanZeroInternal(uint256 _amount) internal pure {
        require(_amount > 0, "Amount must be greater than 0");
    }
}
