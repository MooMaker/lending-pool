// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./configuration/AddressesProvider.sol";
import "./libraries/CoreLibrary.sol";
import "./libraries/EthAddressLib.sol";
import "./interfaces/IReserveInterestRateStrategy.sol";
import "./token/AToken.sol";

contract LendingPoolCore is Initializable {
    using SafeMath for uint256;
    using WadRayMath for uint256;

    using CoreLibrary for CoreLibrary.ReserveData;
    using CoreLibrary for CoreLibrary.UserReserveData;

    AddressesProvider public addressesProvider;

    address public lendingPoolAddress;

    mapping(address => CoreLibrary.ReserveData) internal reserves;
    mapping(address => mapping(address => CoreLibrary.UserReserveData))
        internal usersReserveData;
    address[] public reservesList;

    /**
     * @dev Emitted when the state of a reserve is updated
     * @param reserve the address of the reserve
     * @param liquidityRate the new liquidity rate
     * @param variableBorrowRate the new variable borrow rate
     * @param liquidityIndex the new liquidity index
     * @param variableBorrowIndex the new variable borrow index
     **/
    event ReserveUpdated(
        address indexed reserve,
        uint256 liquidityRate,
        uint256 variableBorrowRate,
        uint256 liquidityIndex,
        uint256 variableBorrowIndex
    );

    /**
     * @dev only lending pools can use functions affected by this modifier
     **/
    modifier onlyLendingPool() {
        require(
            lendingPoolAddress == msg.sender,
            "The caller must be a lending pool contract"
        );
        _;
    }

    // TODO: guard somehow? onlyowner?
    /**
     * @dev initializes the Core contract, invoked upon registration on the AddressesProvider
     * @param _addressesProvider the addressesProvider contract
     **/
    function initialize(
        AddressesProvider _addressesProvider
    ) public initializer {
        addressesProvider = _addressesProvider;
        refreshConfigInternal();
    }

    /**
     * @dev initializes a reserve
     * @param _reserve the address of the reserve
     * @param _aTokenAddress the address of the overlying aToken contract
     * @param _decimals the decimals of the reserve currency
     * @param _interestRateStrategyAddress the address of the interest rate strategy contract
     **/
    function initReserve(
        address _reserve,
        address _aTokenAddress,
        uint256 _decimals,
        address _interestRateStrategyAddress // TODO: implement configurator
    ) external /* onlyLendingPoolConfigurator */ {
        reserves[_reserve].init(
            _aTokenAddress,
            _decimals,
            _interestRateStrategyAddress
        );
        addReserveToListInternal(_reserve);
    }

    /**
     * @dev updates the state of the core as a result of a deposit action
     * @param _reserve the address of the reserve in which the deposit is happening
     * @param _user the address of the the user depositing
     * @param _amount the amount being deposited
     * @param _isFirstDeposit true if the user is depositing for the first time
     **/
    function updateStateOnDeposit(
        address _reserve,
        address _user,
        uint256 _amount,
        bool _isFirstDeposit
    ) external onlyLendingPool {
        // As the time passes by, pool accrues some interest, and we want to know
        // total accrued interest since the last update:
        // - interest to be paid to the depositors
        // - interest to be paid by the borrowers
        reserves[_reserve].updateCumulativeIndexes();
        updateReserveInterestRatesAndTimestampInternal(_reserve, _amount, 0);

        if (_isFirstDeposit) {
            //if this is the first deposit of the user, we configure the deposit as enabled to be used as collateral
            setUserUseReserveAsCollateral(_reserve, _user, true);
        }
    }

    /**
     * @dev updates the state of the core as a consequence of a borrow action.
     * @param _reserve the address of the reserve on which the user is borrowing
     * @param _user the address of the borrower
     * @param _amountBorrowed the new amount borrowed
     * @param _borrowFee the fee on the amount borrowed
     * @param _rateMode the borrow rate mode (stable, variable)
     * @return the new borrow rate for the user
     **/
    function updateStateOnBorrow(
        address _reserve,
        address _user,
        uint256 _amountBorrowed,
        uint256 _borrowFee,
        CoreLibrary.InterestRateMode _rateMode
    ) external onlyLendingPool returns (uint256, uint256) {
        // getting the previous borrow data of the user
        (
            uint256 principalBorrowBalance,
            ,
            uint256 balanceIncrease
        ) = getUserBorrowBalances(_reserve, _user);

        updateReserveStateOnBorrowInternal(
            _reserve,
            _user,
            principalBorrowBalance,
            balanceIncrease,
            _amountBorrowed,
            _rateMode
        );

        updateUserStateOnBorrowInternal(
            _reserve,
            _user,
            _amountBorrowed,
            balanceIncrease,
            _borrowFee,
            _rateMode
        );

        updateReserveInterestRatesAndTimestampInternal(
            _reserve,
            0,
            _amountBorrowed
        );

        return (getUserCurrentBorrowRate(_reserve, _user), balanceIncrease);
    }

    /**
     * @dev gets the normalized income of the reserve. a value of 1e27 means there is no income. A value of 2e27 means there
     * there has been 100% income.
     * @param _reserve the reserve address
     * @return the reserve normalized income
     **/
    function getReserveNormalizedIncome(
        address _reserve
    ) external view returns (uint256) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        return reserve.getNormalizedIncome();
    }

    /**
     * @return the array of reserves configured on the core
     **/
    function getReserves() external view returns (address[] memory) {
        return reservesList;
    }

    /**
     * @dev Updates the reserve current stable borrow rate Rf, the current variable borrow rate Rv and the current liquidity rate Rl.
     * Also updates the lastUpdateTimestamp value. Please refer to the whitepaper for further information.
     * @param _reserve the address of the reserve to be updated
     * @param _liquidityAdded the amount of liquidity added to the protocol (deposit or repay) in the previous action
     * @param _liquidityTaken the amount of liquidity taken from the protocol (redeem or borrow)
     **/

    function updateReserveInterestRatesAndTimestampInternal(
        address _reserve,
        uint256 _liquidityAdded,
        uint256 _liquidityTaken
    ) internal {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];

        IReserveInterestRateStrategy interestRateStrategy = IReserveInterestRateStrategy(
                reserve.interestRateStrategyAddress
            );

        (
            uint256 newLiquidityRate,
            uint256 newVariableRate
        ) = interestRateStrategy.calculateInterestRates(
                _reserve,
                getReserveAvailableLiquidity(_reserve).add(_liquidityAdded).sub(
                    _liquidityTaken
                ),
                reserve.totalBorrowsVariable
            );

        reserve.currentLiquidityRate = newLiquidityRate;
        reserve.currentVariableBorrowRate = newVariableRate;

        //solium-disable-next-line
        reserve.lastUpdateTimestamp = uint40(block.timestamp);

        emit ReserveUpdated(
            _reserve,
            newLiquidityRate,
            newVariableRate,
            reserve.lastLiquidityCumulativeIndex,
            reserve.lastVariableBorrowCumulativeIndex
        );
    }

    /**
     * @dev enables or disables a reserve as collateral
     * @param _reserve the address of the principal reserve where the user deposited
     * @param _user the address of the depositor
     * @param _useAsCollateral true if the depositor wants to use the reserve as collateral
     **/
    function setUserUseReserveAsCollateral(
        address _reserve,
        address _user,
        bool _useAsCollateral
    ) public onlyLendingPool {
        CoreLibrary.UserReserveData storage user = usersReserveData[_user][
            _reserve
        ];
        user.useAsCollateral = _useAsCollateral;
    }

    /**
     * @param _reserve the address of the reserve for which the information is needed
     * @param _user the address of the user for which the information is needed
     * @return true if the user has chosen to use the reserve as collateral, false otherwise
     **/
    function isUserUseReserveAsCollateralEnabled(
        address _reserve,
        address _user
    ) external view returns (bool) {
        CoreLibrary.UserReserveData storage user = usersReserveData[_user][
            _reserve
        ];
        return user.useAsCollateral;
    }

    /**
     * @dev updates the state of a reserve as a consequence of a borrow action.
     * @param _reserve the address of the reserve on which the user is borrowing
     * @param _user the address of the borrower
     * @param _principalBorrowBalance the previous borrow balance of the borrower before the action
     * @param _balanceIncrease the accrued interest of the user on the previous borrowed amount
     * @param _amountBorrowed the new amount borrowed
     * @param _rateMode the borrow rate mode (stable, variable)
     **/

    function updateReserveStateOnBorrowInternal(
        address _reserve,
        address _user,
        uint256 _principalBorrowBalance,
        uint256 _balanceIncrease,
        uint256 _amountBorrowed,
        CoreLibrary.InterestRateMode _rateMode
    ) internal {
        reserves[_reserve].updateCumulativeIndexes();

        //increasing reserve total borrows to account for the new borrow balance of the user

        updateReserveTotalBorrowsByRateModeInternal(
            _reserve,
            _user,
            _principalBorrowBalance,
            _balanceIncrease,
            _amountBorrowed,
            _rateMode
        );
    }

    /**
     * @dev updates the state of the user as a consequence of a stable rate rebalance
     * @param _reserve the address of the principal reserve where the user borrowed
     * @param _user the address of the borrower
     * @param _balanceIncrease the accrued interest on the borrowed amount
     * @param _amountBorrowed the accrued interest on the borrowed amount
     **/
    function updateReserveTotalBorrowsByRateModeInternal(
        address _reserve,
        address _user,
        uint256 _principalBalance,
        uint256 _balanceIncrease,
        uint256 _amountBorrowed,
        CoreLibrary.InterestRateMode _newBorrowRateMode
    ) internal {
        CoreLibrary.InterestRateMode previousRateMode = getUserCurrentBorrowRateMode(
                _reserve,
                _user
            );
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];

        reserve.decreaseTotalBorrowsVariable(_principalBalance);

        uint256 newPrincipalAmount = _principalBalance
            .add(_balanceIncrease)
            .add(_amountBorrowed);
        if (_newBorrowRateMode == CoreLibrary.InterestRateMode.VARIABLE) {
            reserve.increaseTotalBorrowsVariable(newPrincipalAmount);
        } else {
            revert("Invalid new borrow rate mode");
        }
    }

    /**
     * @dev updates the state of a user as a consequence of a borrow action.
     * @param _reserve the address of the reserve on which the user is borrowing
     * @param _user the address of the borrower
     * @param _amountBorrowed the amount borrowed
     * @param _balanceIncrease the accrued interest of the user on the previous borrowed amount
     * @param _rateMode the borrow rate mode (stable, variable)
     **/

    function updateUserStateOnBorrowInternal(
        address _reserve,
        address _user,
        uint256 _amountBorrowed,
        uint256 _balanceIncrease,
        uint256 _fee,
        CoreLibrary.InterestRateMode _rateMode
    ) internal {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        CoreLibrary.UserReserveData storage user = usersReserveData[_user][
            _reserve
        ];

        if (_rateMode == CoreLibrary.InterestRateMode.VARIABLE) {
            //variable
            //reset the user stable rate, and store the new borrow index
            //            user.stableBorrowRate = 0;
            user.lastVariableBorrowCumulativeIndex = reserve
                .lastVariableBorrowCumulativeIndex;
        } else {
            revert("Invalid borrow rate mode");
        }
        //increase the principal borrows and the origination fee
        user.principalBorrowBalance = user
            .principalBorrowBalance
            .add(_amountBorrowed)
            .add(_balanceIncrease);
        user.originationFee = user.originationFee.add(_fee);

        //solium-disable-next-line
        user.lastUpdateTimestamp = uint40(block.timestamp);
    }

    /**
     * @dev transfers an amount from a user to the destination reserve
     * @param _reserve the address of the reserve where the amount is being transferred
     * @param _user the address of the user from where the transfer is happening
     * @param _amount the amount being transferred
     **/
    function transferToReserve(
        address _reserve,
        address payable _user,
        uint256 _amount
    ) external payable onlyLendingPool {
        if (_reserve != EthAddressLib.ethAddress()) {
            require(
                msg.value == 0,
                "User is sending ETH along with the ERC20 transfer."
            );
            IERC20 reserveToken = IERC20(_reserve);
            SafeERC20.safeTransferFrom(
                reserveToken,
                _user,
                payable(address(this)),
                _amount
            );
        } else {
            require(
                msg.value >= _amount,
                "The amount and the value sent to deposit do not match"
            );

            if (msg.value > _amount) {
                //send back excess ETH
                uint256 excessAmount = msg.value.sub(_amount);
                //solium-disable-next-line
                (bool result, ) = _user.call{value: excessAmount, gas: 50000}(
                    ""
                );
                require(result, "Transfer of ETH failed");
            }
        }
    }

    /**
     * @dev activates a reserve
     * @param _reserve the address of the reserve
     **/
    function activateReserve(
        address _reserve // TODO: onlyLendingPoolConfigurator //onlyLendingPoolConfigurator
    ) external {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];

        require(
            reserve.lastLiquidityCumulativeIndex > 0 &&
                reserve.lastVariableBorrowCumulativeIndex > 0,
            "Reserve has not been initialized yet"
        );
        reserve.isActive = true;
    }

    /**
     * @dev deactivates a reserve
     * @param _reserve the address of the reserve
     **/
    function deactivateReserve(
        address _reserve // TODO: implement //onlyLendingPoolConfigurator
    ) external {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        reserve.isActive = false;
    }

    /**
     * @notice data access functions
     **/

    /**
     * @dev returns the basic data (balances, fee accrued, reserve enabled/disabled as collateral)
     * needed to calculate the global account data in the LendingPoolDataProvider
     * @param _reserve the address of the reserve
     * @param _user the address of the user
     * @return the user deposited balance, the principal borrow balance, the fee, and if the reserve is enabled as collateral or not
     **/
    function getUserBasicReserveData(
        address _reserve,
        address _user
    ) external view returns (uint256, uint256, uint256, bool) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        CoreLibrary.UserReserveData storage user = usersReserveData[_user][
            _reserve
        ];

        uint256 underlyingBalance = getUserUnderlyingAssetBalance(
            _reserve,
            _user
        );

        if (user.principalBorrowBalance == 0) {
            return (underlyingBalance, 0, 0, user.useAsCollateral);
        }

        return (
            underlyingBalance,
            user.getCompoundedBorrowBalance(reserve),
            user.originationFee,
            user.useAsCollateral
        );
    }

    /**
     * @dev gets the current borrow rate of the user
     * @param _reserve the address of the reserve for which the information is needed
     * @param _user the address of the user for which the information is needed
     * @return the borrow rate for the user,
     **/
    function getUserCurrentBorrowRate(
        address _reserve,
        address _user
    ) internal view returns (uint256) {
        CoreLibrary.InterestRateMode rateMode = getUserCurrentBorrowRateMode(
            _reserve,
            _user
        );

        if (rateMode == CoreLibrary.InterestRateMode.NONE) {
            return 0;
        }

        return reserves[_reserve].currentVariableBorrowRate;
    }

    /**
     * @dev users with no loans in progress have NONE as borrow rate mode
     * @param _reserve the address of the reserve for which the information is needed
     * @param _user the address of the user for which the information is needed
     * @return the borrow rate mode for the user,
     **/

    function getUserCurrentBorrowRateMode(
        address _reserve,
        address _user
    ) public view returns (CoreLibrary.InterestRateMode) {
        CoreLibrary.UserReserveData storage user = usersReserveData[_user][
            _reserve
        ];

        if (user.principalBorrowBalance == 0) {
            return CoreLibrary.InterestRateMode.NONE;
        }

        return CoreLibrary.InterestRateMode.VARIABLE;
    }

    /**
     * @dev gets the underlying asset balance of a user based on the corresponding aToken balance.
     * @param _reserve the reserve address
     * @param _user the user address
     * @return the underlying deposit balance of the user
     **/

    function getUserUnderlyingAssetBalance(
        address _reserve,
        address _user
    ) public view returns (uint256) {
        AToken aToken = AToken(reserves[_reserve].aTokenAddress);
        return aToken.balanceOf(_user);
    }

    /**
     * @dev gets the total liquidity in the reserve. The total liquidity is the balance of the core contract + total borrows
     * @param _reserve the reserve address
     * @return the total liquidity
     **/
    function getReserveTotalLiquidity(
        address _reserve
    ) public view returns (uint256) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        return
            getReserveAvailableLiquidity(_reserve).add(
                reserve.getTotalBorrows()
            );
    }

    /**
     * @dev this function aggregates the configuration parameters of the reserve.
     * It's used in the LendingPoolDataProvider specifically to save gas, and avoid
     * multiple external contract calls to fetch the same data.
     * @param _reserve the reserve address
     * @return the reserve decimals
     * @return the base ltv as collateral
     * @return the liquidation threshold
     * @return if the reserve is used as collateral or not
     **/
    function getReserveConfiguration(
        address _reserve
    ) external view returns (uint256, uint256, uint256, bool) {
        uint256 decimals;
        uint256 baseLTVasCollateral;
        uint256 liquidationThreshold;
        bool usageAsCollateralEnabled;

        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        decimals = reserve.decimals;
        baseLTVasCollateral = reserve.baseLTVasCollateral;
        liquidationThreshold = reserve.liquidationThreshold;
        usageAsCollateralEnabled = reserve.usageAsCollateralEnabled;

        return (
            decimals,
            baseLTVasCollateral,
            liquidationThreshold,
            usageAsCollateralEnabled
        );
    }

    /**
     * @dev returns the decimals of the reserve
     * @param _reserve the reserve address
     * @return the reserve decimals
     **/
    function getReserveDecimals(
        address _reserve
    ) external view returns (uint256) {
        return reserves[_reserve].decimals;
    }

    /**
     * @dev gets the available liquidity in the reserve. The available liquidity is the balance of the core contract
     * @param _reserve the reserve address
     * @return the available liquidity
     **/
    function getReserveAvailableLiquidity(
        address _reserve
    ) public view returns (uint256) {
        uint256 balance = 0;

        if (_reserve == EthAddressLib.ethAddress()) {
            balance = address(this).balance;
        } else {
            balance = IERC20(_reserve).balanceOf(address(this));
        }
        return balance;
    }

    /**
     * @dev gets the reserve total borrows variable
     * @param _reserve the reserve address
     * @return the total borrows variable
     **/
    function getReserveTotalBorrowsVariable(
        address _reserve
    ) external view returns (uint256) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        return reserve.totalBorrowsVariable;
    }

    /**
     * @dev gets the reserve current variable borrow rate. Is the base variable borrow rate if the reserve is empty
     * @param _reserve the reserve address
     * @return the reserve current variable borrow rate
     **/

    function getReserveCurrentVariableBorrowRate(
        address _reserve
    ) external view returns (uint256) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];

        if (reserve.currentVariableBorrowRate == 0) {
            return
                IReserveInterestRateStrategy(
                    reserve.interestRateStrategyAddress
                ).getBaseVariableBorrowRate();
        }
        return reserve.currentVariableBorrowRate;
    }

    /**
     * @dev gets the reserve liquidity rate
     * @param _reserve the reserve address
     * @return the reserve liquidity rate
     **/
    function getReserveCurrentLiquidityRate(
        address _reserve
    ) external view returns (uint256) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        return reserve.currentLiquidityRate;
    }

    /**
     * @dev returns the utilization rate U of a specific reserve
     * @param _reserve the reserve for which the information is needed
     * @return the utilization rate in ray
     **/

    function getReserveUtilizationRate(
        address _reserve
    ) public view returns (uint256) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];

        uint256 totalBorrows = reserve.getTotalBorrows();

        if (totalBorrows == 0) {
            return 0;
        }

        uint256 availableLiquidity = getReserveAvailableLiquidity(_reserve);

        return totalBorrows.rayDiv(availableLiquidity.add(totalBorrows));
    }

    /**
     * @dev gets the reserve variable borrow index
     * @param _reserve the reserve address
     * @return the reserve variable borrow index
     **/
    function getReserveVariableBorrowsCumulativeIndex(
        address _reserve
    ) external view returns (uint256) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        return reserve.lastVariableBorrowCumulativeIndex;
    }

    /**
     * @dev gets the aToken contract address for the reserve
     * @param _reserve the reserve address
     * @return the address of the aToken contract
     **/
    function getReserveATokenAddress(
        address _reserve
    ) public view returns (address) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        return reserve.aTokenAddress;
    }

    /**
     * @notice returns the timestamp of the last action on the reserve
     * @param _reserve the reserve for which the information is needed
     * @return timestamp - the last updated timestamp of the reserve
     **/
    function getReserveLastUpdate(
        address _reserve
    ) external view returns (uint40 timestamp) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        timestamp = reserve.lastUpdateTimestamp;
    }

    /**
     * @dev gets the reserve liquidity cumulative index
     * @param _reserve the reserve address
     * @return the reserve liquidity cumulative index
     **/
    function getReserveLiquidityCumulativeIndex(
        address _reserve
    ) external view returns (uint256) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        return reserve.lastLiquidityCumulativeIndex;
    }

    /**
     * @dev updates the internal configuration of the core
     **/
    function refreshConfigInternal() internal {
        lendingPoolAddress = addressesProvider.getLendingPool();
    }

    /**
     * @dev returns true if the reserve is active
     * @param _reserve the reserve address
     * @return true if the reserve is active, false otherwise
     **/
    function getReserveIsActive(address _reserve) external view returns (bool) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        return reserve.isActive;
    }

    /**
     * @dev adds a reserve to the array of the reserves address
     **/
    function addReserveToListInternal(address _reserve) internal {
        bool reserveAlreadyAdded = false;
        for (uint256 i = 0; i < reservesList.length; i++)
            if (reservesList[i] == _reserve) {
                reserveAlreadyAdded = true;
            }
        if (!reserveAlreadyAdded) reservesList.push(_reserve);
    }

    /**
     * @dev calculates and returns the borrow balances of the user
     * @param _reserve the address of the reserve
     * @param _user the address of the user
     * @return the principal borrow balance, the compounded balance and the balance increase since the last borrow/repay/swap/rebalance
     **/

    function getUserBorrowBalances(
        address _reserve,
        address _user
    ) public view returns (uint256, uint256, uint256) {
        CoreLibrary.UserReserveData storage user = usersReserveData[_user][
            _reserve
        ];
        if (user.principalBorrowBalance == 0) {
            return (0, 0, 0);
        }

        uint256 principal = user.principalBorrowBalance;
        uint256 compoundedBalance = CoreLibrary.getCompoundedBorrowBalance(
            user,
            reserves[_reserve]
        );
        return (principal, compoundedBalance, compoundedBalance.sub(principal));
    }

    /**
     * @dev the variable borrow index of the user is 0 if the user is not borrowing or borrowing at stable
     * @param _reserve the address of the reserve for which the information is needed
     * @param _user the address of the user for which the information is needed
     * @return the variable borrow index for the user
     **/

    function getUserVariableBorrowCumulativeIndex(
        address _reserve,
        address _user
    ) external view returns (uint256) {
        CoreLibrary.UserReserveData storage user = usersReserveData[_user][
            _reserve
        ];
        return user.lastVariableBorrowCumulativeIndex;
    }

    /**
     * @param _reserve the address of the reserve for which the information is needed
     * @param _user the address of the user for which the information is needed
     * @return the origination fee for the user
     **/
    function getUserOriginationFee(
        address _reserve,
        address _user
    ) external view returns (uint256) {
        CoreLibrary.UserReserveData storage user = usersReserveData[_user][
            _reserve
        ];
        return user.originationFee;
    }

    /**
     * @dev the variable borrow index of the user is 0 if the user is not borrowing or borrowing at stable
     * @param _reserve the address of the reserve for which the information is needed
     * @param _user the address of the user for which the information is needed
     * @return timestamp - the variable borrow index for the user
     **/
    function getUserLastUpdate(
        address _reserve,
        address _user
    ) external view returns (uint256 timestamp) {
        CoreLibrary.UserReserveData storage user = usersReserveData[_user][
            _reserve
        ];
        timestamp = user.lastUpdateTimestamp;
    }

    /**
     * @dev transfers to the user a specific amount from the reserve.
     * @param _reserve the address of the reserve where the transfer is happening
     * @param _user the address of the user receiving the transfer
     * @param _amount the amount being transferred
     **/
    function transferToUser(
        address _reserve,
        address payable _user,
        uint256 _amount
    ) external onlyLendingPool {
        if (_reserve != EthAddressLib.ethAddress()) {
            IERC20 reserveToken = IERC20(_reserve);
            SafeERC20.safeTransfer(reserveToken, _user, _amount);
        } else {
            (bool result, ) = _user.call{value: _amount, gas: 50000}("");
            require(result, "Transfer of ETH failed");
        }
    }

    /**
     * @dev enables a reserve to be used as collateral
     * @param _reserve the address of the reserve
     **/
    function enableReserveAsCollateral(
        address _reserve,
        uint256 _baseLTVasCollateral // TODO(liquidation): implement configurator
    )
        external
    // TODO(liquidation): implement //        uint256 _liquidationThreshold, //        uint256 _liquidationBonus
    //        onlyLendingPoolConfigurator
    {
        reserves[_reserve].enableAsCollateral(_baseLTVasCollateral);
        //            _liquidationThreshold,
        //            _liquidationBonus
    }

    /**
     * @dev disables a reserve to be used as collateral
     * @param _reserve the address of the reserve
     **/
    function disableReserveAsCollateral(
        address _reserve // TODO(liquidation): implement //onlyLendingPoolConfigurator
    ) external {
        reserves[_reserve].disableAsCollateral();
    }
}
