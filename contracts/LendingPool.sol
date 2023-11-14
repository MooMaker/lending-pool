// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./configuration/AddressesProvider.sol";
import "./token/AToken.sol";
import "./LendingPoolCore.sol";
import {CoreLibrary} from "./libraries/CoreLibrary.sol";
import {LendingPoolDataProvider} from "./LendingPoolDataProvider.sol";

contract LendingPool is ReentrancyGuard, Initializable {
    AddressesProvider public addressesProvider;
    LendingPoolDataProvider public dataProvider;
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
     * @dev emitted on borrow
     * @param _reserve the address of the reserve
     * @param _user the address of the user
     * @param _amount the amount to be deposited
     * @param _borrowRate the rate at which the user has borrowed
     * @param _originationFee the origination fee to be paid by the user
     * @param _borrowBalanceIncrease the balance increase since the last borrow, 0 if it's the first time borrowing
     * @param _referral the referral number of the action
     * @param _timestamp the timestamp of the action
     **/
    event Borrow(
        address indexed _reserve,
        address indexed _user,
        uint256 _amount,
        uint256 _borrowRate,
        uint256 _originationFee,
        uint256 _borrowBalanceIncrease,
        uint16 indexed _referral,
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
    function initialize(
        AddressesProvider _addressesProvider
    ) public initializer {
        addressesProvider = _addressesProvider;
        dataProvider = LendingPoolDataProvider(
            addressesProvider.getLendingPoolDataProvider()
        );
        core = LendingPoolCore(addressesProvider.getLendingPoolCore());
    }

    /**
     * @dev deposits The underlying asset into the reserve. A corresponding amount of the overlying asset (aTokens)
     * is minted.
     * @param _reserve the address of the reserve
     * @param _amount the amount to be deposited
     **/
    function deposit(
        address _reserve,
        uint256 _amount
    )
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

        bool isFirstDeposit = aToken.balanceOf(msg.sender) == 0;

        // Having in mind discrete nature of the blockchain processing, we need to update the state of the pool
        // as a result of one of the pool actions (deposit in this case) in order to calculate the correct accrued interest values
        // of the pool. They are going to be used on later stage to determine accrued interest for the user.
        core.updateStateOnDeposit(
            _reserve,
            msg.sender,
            _amount,
            isFirstDeposit
        );

        // Minting AToken to user 1:1 with the specific exchange rate
        // Aside from that it also minting the interest to the user
        aToken.mintOnDeposit(msg.sender, _amount);

        // transfer to the core contract
        core.transferToReserve{value: msg.value}(
            _reserve,
            payable(msg.sender),
            _amount
        );

        //solium-disable-next-line
        emit Deposit(_reserve, msg.sender, _amount, block.timestamp);
    }

    /**
     * @dev data structures for local computations in the borrow() method.
     */
    struct BorrowLocalVars {
        uint256 principalBorrowBalance;
        uint256 currentLtv;
        uint256 currentLiquidationThreshold;
        //        uint256 borrowFee;
        uint256 requestedBorrowAmountETH;
        uint256 amountOfCollateralNeededETH;
        uint256 userCollateralBalanceETH;
        uint256 userBorrowBalanceETH;
        uint256 userTotalFeesETH;
        uint256 borrowBalanceIncrease;
        uint256 currentReserveStableRate;
        uint256 availableLiquidity;
        uint256 reserveDecimals;
        uint256 finalUserBorrowRate;
        //        CoreLibrary.InterestRateMode rateMode;
        //        bool healthFactorBelowThreshold;
    }

    /**
     * @dev Allows users to borrow a specific amount of the reserve currency, provided that the borrower
     * already deposited enough collateral.
     * @param _reserve the address of the reserve
     * @param _amount the amount to be borrowed
     **/
    function borrow(
        address _reserve,
        uint256 _amount,
        //        uint256 _interestRateMode,
        uint16 _referralCode
    )
        external
        nonReentrant
        onlyActiveReserve(_reserve)
        // TODO: add
        //        onlyUnfreezedReserve(_reserve)
        onlyAmountGreaterThanZero(_amount)
    {
        // Usage of a memory struct of vars to avoid "Stack too deep" errors due to local variables
        BorrowLocalVars memory vars;

        // TODO: add this check
        //check that the reserve is enabled for borrowing
        //        require(core.isReserveBorrowingEnabled(_reserve), "Reserve is not enabled for borrowing");

        // TODO: remove since we only support variable interest rate mode?
        //        //validate interest rate mode
        //                require(
        //            uint256(CoreLibrary.InterestRateMode.VARIABLE) == _interestRateMode ||
        //            uint256(CoreLibrary.InterestRateMode.STABLE) == _interestRateMode,
        //            "Invalid interest rate mode selected"
        //        );
        //

        // TODO: remove?
        //cast the rateMode to coreLibrary.interestRateMode
        //        vars.rateMode = CoreLibrary.InterestRateMode(_interestRateMode);

        //check that the amount is available in the reserve
        vars.availableLiquidity = core.getReserveAvailableLiquidity(_reserve);

        require(
            vars.availableLiquidity >= _amount,
            "There is not enough liquidity available in the reserve"
        );

        (
            ,
            vars.userCollateralBalanceETH,
            vars.userBorrowBalanceETH,
            vars.userTotalFeesETH,
            vars.currentLtv,
            vars.currentLiquidationThreshold
            //                ,
            //                    vars.healthFactorBelowThreshold
        ) = dataProvider.calculateUserGlobalData(msg.sender);

        require(
            vars.userCollateralBalanceETH > 0,
            "The collateral balance is 0"
        );

        // TODO: implement
        //        require(
        //            !vars.healthFactorBelowThreshold,
        //            "The borrower can already be liquidated so he cannot borrow more"
        //        );
        //

        // TODO: implement
        //calculating fees
        //        vars.borrowFee = feeProvider.calculateLoanOriginationFee(
        //            msg.sender,
        //            _amount
        //        );
        //
        //        require(vars.borrowFee > 0, "The amount to borrow is too small");
        //
        vars.amountOfCollateralNeededETH = dataProvider
            .calculateCollateralNeededInETH(
                _reserve,
                _amount,
                // TODO: pass fee
                /* vars.borrowFee */ 0,
                vars.userBorrowBalanceETH,
                vars.userTotalFeesETH,
                vars.currentLtv
            );

        require(
            vars.amountOfCollateralNeededETH <= vars.userCollateralBalanceETH,
            "There is not enough collateral to cover a new borrow"
        );

        //        //all conditions passed - borrow is accepted
        (vars.finalUserBorrowRate, vars.borrowBalanceIncrease) = core
            .updateStateOnBorrow(
                _reserve,
                msg.sender,
                _amount,
                // TODO: pass fee
                /* vars.borrowFee */ 0,
                CoreLibrary.InterestRateMode.VARIABLE
            );

        //if we reached this point, we can transfer
        core.transferToUser(_reserve, payable(msg.sender), _amount);

        emit Borrow(
            _reserve,
            msg.sender,
            _amount,
            vars.finalUserBorrowRate,
            // TODO: add borrow fee
            /* vars.borrowFee */ 0,
            vars.borrowBalanceIncrease,
            _referralCode,
            block.timestamp
        );
    }

    function getReserveData(
        address _reserve
    )
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
        variableBorrowIndex = core.getReserveVariableBorrowsCumulativeIndex(
            _reserve
        );
        aTokenAddress = core.getReserveATokenAddress(_reserve);
        lastUpdateTimestamp = core.getReserveLastUpdate(_reserve);
    }

    function getUserReserveData(
        address _reserve,
        address _user
    )
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
            uint256 lastUpdateTimestamp,
            bool usageAsCollateralEnabled
        )
    {
        // TODO: consider using data provider
        //        return dataProvider.getUserReserveData(_reserve, _user);

        currentATokenBalance = AToken(core.getReserveATokenAddress(_reserve))
            .balanceOf(_user);
        // TODO: handle stable borrow rate?
        //        CoreLibrary.InterestRateMode mode = core.getUserCurrentBorrowRateMode(_reserve, _user);
        (principalBorrowBalance, currentBorrowBalance, ) = core
            .getUserBorrowBalances(_reserve, _user);

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
        variableBorrowIndex = core.getUserVariableBorrowCumulativeIndex(
            _reserve,
            _user
        );
        lastUpdateTimestamp = core.getUserLastUpdate(_reserve, _user);
        usageAsCollateralEnabled = core.isUserUseReserveAsCollateralEnabled(
            _reserve,
            _user
        );
    }

    /**
     * @dev internal function to save on code size for the onlyActiveReserve modifier
     **/
    function requireReserveActiveInternal(address _reserve) internal view {
        require(
            core.getReserveIsActive(_reserve),
            "Action requires an active reserve"
        );
    }

    /**
     * @notice internal function to save on code size for the onlyAmountGreaterThanZero modifier
     **/
    function requireAmountGreaterThanZeroInternal(
        uint256 _amount
    ) internal pure {
        require(_amount > 0, "Amount must be greater than 0");
    }
}
