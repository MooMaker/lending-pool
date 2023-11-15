// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./configuration/AddressesProvider.sol";
import "./token/AToken.sol";
import "./LendingPoolCore.sol";
import {CoreLibrary} from "./libraries/CoreLibrary.sol";
import {EthAddressLib} from "./libraries/EthAddressLib.sol";
import {LendingPoolDataProvider} from "./LendingPoolDataProvider.sol";
import {IFeeProvider} from "./interfaces/IFeeProvider.sol";

contract LendingPool is ReentrancyGuard, Initializable {
    using SafeMath for uint256;

    AddressesProvider public addressesProvider;
    LendingPoolDataProvider public dataProvider;
    LendingPoolCore public core;
    IFeeProvider private feeProvider;

    uint256 public constant UINT_MAX_VALUE = type(uint256).max;
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
     * @dev emitted on repay
     * @param _reserve the address of the reserve
     * @param _user the address of the user for which the repay has been executed
     * @param _repayer the address of the user that has performed the repay action
     * @param _amountMinusFees the amount repaid minus fees
     * @param _fees the fees repaid
     * @param _borrowBalanceIncrease the balance increase since the last action
     * @param _timestamp the timestamp of the action
     **/
    event Repay(
        address indexed _reserve,
        address indexed _user,
        address indexed _repayer,
        uint256 _amountMinusFees,
        uint256 _fees,
        uint256 _borrowBalanceIncrease,
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
        feeProvider = IFeeProvider(addressesProvider.getFeeProvider());
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
        uint256 borrowFee;
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

        //calculating fees
        vars.borrowFee = feeProvider.calculateLoanOriginationFee(
            msg.sender,
            _amount
        );

        require(vars.borrowFee > 0, "The amount to borrow is too small");
        //
        vars.amountOfCollateralNeededETH = dataProvider
            .calculateCollateralNeededInETH(
                _reserve,
                _amount,
                vars.borrowFee,
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
                vars.borrowFee,
                CoreLibrary.InterestRateMode.VARIABLE
            );

        //if we reached this point, we can transfer
        core.transferToUser(_reserve, payable(msg.sender), _amount);

        emit Borrow(
            _reserve,
            msg.sender,
            _amount,
            vars.finalUserBorrowRate,
            vars.borrowFee,
            vars.borrowBalanceIncrease,
            _referralCode,
            block.timestamp
        );
    }

    /**
     * @notice repays a borrow on the specific reserve, for the specified amount (or for the whole amount, if uint256(-1) is specified).
     * @dev the target user is defined by _onBehalfOf. If there is no repayment on behalf of another account,
     * _onBehalfOf must be equal to msg.sender.
     * @param _reserve the address of the reserve on which the user borrowed
     * @param _amount the amount to repay, or uint256(-1) if the user wants to repay everything
     * @param _onBehalfOf the address for which msg.sender is repaying.
     **/

    struct RepayLocalVars {
        uint256 principalBorrowBalance;
        uint256 compoundedBorrowBalance;
        uint256 borrowBalanceIncrease;
        bool isETH;
        uint256 paybackAmount;
        uint256 paybackAmountMinusFees;
        uint256 currentStableRate;
        uint256 originationFee;
    }

    function repay(
        address _reserve,
        uint256 _amount,
        address payable _onBehalfOf
    )
        external
        payable
        nonReentrant
        onlyActiveReserve(_reserve)
        onlyAmountGreaterThanZero(_amount)
    {
        // Usage of a memory struct of vars to avoid "Stack too deep" errors due to local variables
        RepayLocalVars memory vars;

        (
            vars.principalBorrowBalance,
            vars.compoundedBorrowBalance,
            vars.borrowBalanceIncrease
        ) = core.getUserBorrowBalances(_reserve, _onBehalfOf);

        vars.originationFee = core.getUserOriginationFee(_reserve, _onBehalfOf);
        vars.isETH = EthAddressLib.ethAddress() == _reserve;

        require(
            vars.compoundedBorrowBalance > 0,
            "The user does not have any borrow pending"
        );

        require(
            _amount != UINT_MAX_VALUE || msg.sender == _onBehalfOf,
            "To repay on behalf of an user an explicit amount to repay is needed."
        );

        //default to max amount
        vars.paybackAmount = vars.compoundedBorrowBalance.add(
            vars.originationFee
        );

        if (_amount != UINT_MAX_VALUE && _amount < vars.paybackAmount) {
            vars.paybackAmount = _amount;
        }

        require(
            !vars.isETH || msg.value >= vars.paybackAmount,
            "Invalid msg.value sent for the repayment"
        );

        //if the amount is smaller than the origination fee, just transfer the amount to the fee destination address
        if (vars.paybackAmount <= vars.originationFee) {
            core.updateStateOnRepay(
                _reserve,
                _onBehalfOf,
                0,
                vars.paybackAmount,
                vars.borrowBalanceIncrease,
                false
            );

            core.transferToFeeCollectionAddress{
                value: vars.isETH ? vars.paybackAmount : 0
            }(
                _reserve,
                _onBehalfOf,
                vars.paybackAmount,
                addressesProvider.getTokenDistributor()
            );

            emit Repay(
                _reserve,
                _onBehalfOf,
                msg.sender,
                0,
                vars.paybackAmount,
                vars.borrowBalanceIncrease,
                block.timestamp
            );
            return;
        }

        //        vars.paybackAmountMinusFees = vars.paybackAmount.sub(vars.originationFee);
        //
        //        core.updateStateOnRepay(
        //            _reserve,
        //            _onBehalfOf,
        //            vars.paybackAmountMinusFees,
        //            vars.originationFee,
        //            vars.borrowBalanceIncrease,
        //            vars.compoundedBorrowBalance == vars.paybackAmountMinusFees
        //        );
        //
        //        //if the user didn't repay the origination fee, transfer the fee to the fee collection address
        //        if(vars.originationFee > 0) {
        //            core.transferToFeeCollectionAddress.value(vars.isETH ? vars.originationFee : 0)(
        //                _reserve,
        //                msg.sender,
        //                vars.originationFee,
        //                addressesProvider.getTokenDistributor()
        //            );
        //        }
        //
        //        //sending the total msg.value if the transfer is ETH.
        //        //the transferToReserve() function will take care of sending the
        //        //excess ETH back to the caller
        //        core.transferToReserve.value(vars.isETH ? msg.value.sub(vars.originationFee) : 0)(
        //            _reserve,
        //            msg.sender,
        //            vars.paybackAmountMinusFees
        //        );
        //
        //        emit Repay(
        //            _reserve,
        //            _onBehalfOf,
        //            msg.sender,
        //            vars.paybackAmountMinusFees,
        //            vars.originationFee,
        //            vars.borrowBalanceIncrease,
        //            //solium-disable-next-line
        //            block.timestamp
        //        );
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
