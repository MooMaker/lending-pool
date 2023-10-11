// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./configuration/AddressesProvider.sol";
import "./token/AToken.sol";
import "./LendingPoolCore.sol";

contract LendingPool is ReentrancyGuard, Initializable {
    AddressesProvider public addressesProvider;
    LendingPoolCore public core;

    /**
    * @dev emitted on deposit
    * @param _reserve the address of the reserve
    * @param _user the address of the user
    * @param _amount the amount to be deposited
    * @param _timestamp the timestamp of the action
    **/
    event Deposit(
        address indexed _reserve,
        address indexed _user,
        uint256 _amount,
        uint256 _timestamp
    );

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

    // TODO: guard somehow? onlyowner?
    /**
    * @dev this function is invoked by the proxy contract when the LendingPool contract is added to the
    * AddressesProvider.
    * @param _addressesProvider the address of the LendingPoolAddressesProvider registry
    **/
    function initialize(AddressesProvider _addressesProvider) public initializer {
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
        core.updateStateOnDeposit(_reserve, /* msg.sender ,*/ _amount /*, isFirstDeposit */);

        // Minting AToken to user 1:1 with the specific exchange rate
        // Aside from that it also minting the interest to the user
        aToken.mintOnDeposit(msg.sender, _amount);

        // transfer to the core contract
        core.transferToReserve{ value: msg.value }(_reserve, payable(msg.sender), _amount);

        //solium-disable-next-line
        emit Deposit(_reserve, msg.sender, _amount, block.timestamp);
    }

    function getReserveData(address _reserve)
        external
        view
        returns (
            uint256 totalLiquidity,
            uint256 availableLiquidity,
//          TODO: do we need them?
//            uint256 totalBorrowsStable,
            uint256 totalBorrowsVariable,
            uint256 liquidityRate,
            uint256 variableBorrowRate,
//            uint256 stableBorrowRate,
//            uint256 averageStableBorrowRate,
            uint256 utilizationRate,
            uint256 liquidityIndex,
            uint256 variableBorrowIndex,
            address aTokenAddress,
            uint40 lastUpdateTimestamp
        )
    {
        // TODO: consider using data provider
        //   return dataProvider.getReserveData(_reserve);

        totalLiquidity = core.getReserveTotalLiquidity(_reserve);
        availableLiquidity = core.getReserveAvailableLiquidity(_reserve);
//        totalBorrowsStable = core.getReserveTotalBorrowsStable(_reserve);
        totalBorrowsVariable = core.getReserveTotalBorrowsVariable(_reserve);
        liquidityRate = core.getReserveCurrentLiquidityRate(_reserve);
        variableBorrowRate = core.getReserveCurrentVariableBorrowRate(_reserve);
//        stableBorrowRate = core.getReserveCurrentStableBorrowRate(_reserve);
//        averageStableBorrowRate = core.getReserveCurrentAverageStableBorrowRate(_reserve);
        utilizationRate = core.getReserveUtilizationRate(_reserve);
        liquidityIndex = core.getReserveLiquidityCumulativeIndex(_reserve);
        variableBorrowIndex = core.getReserveVariableBorrowsCumulativeIndex(_reserve);
        aTokenAddress = core.getReserveATokenAddress(_reserve);
        lastUpdateTimestamp = core.getReserveLastUpdate(_reserve);
    }

    function getUserReserveData(address _reserve, address _user)
        external
        view
        returns (
            uint256 currentATokenBalance,
            uint256 currentBorrowBalance,
            uint256 principalBorrowBalance,
            uint256 borrowRateMode,
            uint256 borrowRate,
            uint256 liquidityRate,
            uint256 originationFee,
            uint256 variableBorrowIndex,
            uint256 lastUpdateTimestamp
            // TODO: do we need it?
            // bool usageAsCollateralEnabled
        )
    {
        // TODO: consider using data provider
//        return dataProvider.getUserReserveData(_reserve, _user);

        currentATokenBalance = AToken(core.getReserveATokenAddress(_reserve)).balanceOf(_user);
        // TODO: handle stable borrow rate?
//        CoreLibrary.InterestRateMode mode = core.getUserCurrentBorrowRateMode(_reserve, _user);
        (principalBorrowBalance, currentBorrowBalance, ) = core.getUserBorrowBalances(
            _reserve,
            _user
        );

        //default is 0, if mode == CoreLibrary.InterestRateMode.NONE
//        if (mode == CoreLibrary.InterestRateMode.STABLE) {
//            borrowRate = core.getUserCurrentStableBorrowRate(_reserve, _user);
//        } else if (mode == CoreLibrary.InterestRateMode.VARIABLE) {
            borrowRate = core.getReserveCurrentVariableBorrowRate(_reserve);
//        }
//
        borrowRateMode = uint256(CoreLibrary.InterestRateMode.VARIABLE);
        liquidityRate = core.getReserveCurrentLiquidityRate(_reserve);
        originationFee = core.getUserOriginationFee(_reserve, _user);
        variableBorrowIndex = core.getUserVariableBorrowCumulativeIndex(_reserve, _user);
        lastUpdateTimestamp = core.getUserLastUpdate(_reserve, _user);
//        usageAsCollateralEnabled = core.isUserUseReserveAsCollateralEnabled(_reserve, _user);
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
