// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./WadRayMath.sol";

library CoreLibrary {
    using SafeMath for uint256;
    using WadRayMath for uint256;

    // TODO(stable): handle stable rate mode?
    enum InterestRateMode {
        NONE,
        /*STABLE,*/ VARIABLE
    }

    uint256 internal constant SECONDS_PER_YEAR = 365 days;

    struct UserReserveData {
        //principal amount borrowed by the user.
        uint256 principalBorrowBalance;
        //cumulated variable borrow index for the user. Expressed in ray
        uint256 lastVariableBorrowCumulativeIndex;
        //origination fee cumulated by the user
        uint256 originationFee;
        // stable borrow rate at which the user has borrowed. Expressed in ray
        //        uint256 stableBorrowRate;
        uint40 lastUpdateTimestamp;
        //defines if a specific deposit should or not be used as a collateral in borrows
        bool useAsCollateral;
    }

    struct ReserveData {
        //the liquidity index. Expressed in ray
        uint256 lastLiquidityCumulativeIndex;
        //variable borrow index. Expressed in ray
        uint256 lastVariableBorrowCumulativeIndex;
        // the current supply rate. Expressed in ray
        uint256 currentLiquidityRate;
        //the current borrow rate. Expressed in ray
        uint256 currentVariableBorrowRate;
        // the total borrows of the reserve. Expressed in the currency decimals
        uint256 totalBorrowsVariable;
        //the decimals of the reserve asset
        uint256 decimals;
        //the ltv of the reserve. Expressed in percentage (0-100)
        uint256 baseLTVasCollateral;
        //the liquidation threshold of the reserve. Expressed in percentage (0-100)
        uint256 liquidationThreshold;
        /**
         * @dev address of the interest rate strategy contract
         **/
        address interestRateStrategyAddress;
        /**
         * @dev address of the aToken representing the asset
         **/
        address aTokenAddress;
        uint40 lastUpdateTimestamp;
        // usageAsCollateralEnabled = true means users can use this reserve as collateral
        bool usageAsCollateralEnabled;
        // isActive = true means the reserve has been activated and properly configured
        bool isActive;
    }

    /**
     * @dev initializes a reserve
     * @param _self the reserve object
     * @param _aTokenAddress the address of the overlying atoken contract
     * @param _decimals the number of decimals of the underlying asset
     * @param _interestRateStrategyAddress the address of the interest rate strategy contract
     **/
    function init(
        ReserveData storage _self,
        address _aTokenAddress,
        uint256 _decimals,
        address _interestRateStrategyAddress
    ) internal {
        require(
            _self.aTokenAddress == address(0),
            "Reserve has already been initialized"
        );

        if (_self.lastLiquidityCumulativeIndex == 0) {
            //if the reserve has not been initialized yet
            _self.lastLiquidityCumulativeIndex = WadRayMath.ray();
        }

        if (_self.lastVariableBorrowCumulativeIndex == 0) {
            _self.lastVariableBorrowCumulativeIndex = WadRayMath.ray();
        }

        _self.aTokenAddress = _aTokenAddress;
        _self.decimals = _decimals;

        _self.interestRateStrategyAddress = _interestRateStrategyAddress;
        _self.isActive = true;
        // TODO(freezing): implement
        //        _self.isFreezed = false;
    }

    /**
     * @dev returns the ongoing normalized income for the reserve.
     * a value of 1e27 means there is no income. As time passes, the income is accrued.
     * A value of 2*1e27 means that the income of the reserve is double the initial amount.
     * @param _reserve the reserve object
     * @return the normalized income. expressed in ray
     **/
    function getNormalizedIncome(
        CoreLibrary.ReserveData storage _reserve
    ) internal view returns (uint256) {
        uint256 cumulated = calculateLinearInterest(
            _reserve.currentLiquidityRate,
            _reserve.lastUpdateTimestamp
        ).rayMul(_reserve.lastLiquidityCumulativeIndex);

        return cumulated;
    }

    /**
     * @dev Updates the liquidity cumulative index Ci and variable borrow cumulative index Bvc. Refer to the whitepaper for
     * a formal specification.
     * @param _self the reserve object
     **/
    function updateCumulativeIndexes(ReserveData storage _self) internal {
        uint256 totalBorrowsVariable = getTotalBorrows(_self);

        if (totalBorrowsVariable > 0) {
            // Only cumulating if there is any income being produced
            uint256 cumulatedLiquidityInterest = calculateLinearInterest(
                _self.currentLiquidityRate,
                _self.lastUpdateTimestamp
            );

            // TODO: needs to be set to 1 ray by default?
            _self.lastLiquidityCumulativeIndex = cumulatedLiquidityInterest
                .rayMul(_self.lastLiquidityCumulativeIndex);

            uint256 cumulatedVariableBorrowInterest = calculateCompoundedInterest(
                    _self.currentVariableBorrowRate,
                    _self.lastUpdateTimestamp
                );
            _self
                .lastVariableBorrowCumulativeIndex = cumulatedVariableBorrowInterest
                .rayMul(_self.lastVariableBorrowCumulativeIndex);
        }
    }

    /**
     * @dev function to calculate the interest using a linear interest rate formula
     * @param _rate the interest rate, in ray
     * @param _lastUpdateTimestamp the timestamp of the last update of the interest
     * @return the interest rate linearly accumulated during the timeDelta, in ray
     **/
    function calculateLinearInterest(
        uint256 _rate,
        uint40 _lastUpdateTimestamp
    ) internal view returns (uint256) {
        //solium-disable-next-line
        uint256 timeDifference = block.timestamp.sub(
            uint256(_lastUpdateTimestamp)
        );

        uint256 timeDelta = timeDifference.wadToRay().rayDiv(
            SECONDS_PER_YEAR.wadToRay()
        );

        return _rate.rayMul(timeDelta).add(WadRayMath.ray());
    }

    /**
     * @dev function to calculate the interest using a compounded interest rate formula
     * @param _rate the interest rate, in ray
     * @param _lastUpdateTimestamp the timestamp of the last update of the interest
     * @return the interest rate compounded during the timeDelta, in ray
     **/
    function calculateCompoundedInterest(
        uint256 _rate,
        uint40 _lastUpdateTimestamp
    ) internal view returns (uint256) {
        uint256 timeDifference = block.timestamp.sub(
            uint256(_lastUpdateTimestamp)
        );

        uint256 ratePerSecond = _rate.div(SECONDS_PER_YEAR);

        return ratePerSecond.add(WadRayMath.ray()).rayPow(timeDifference);
    }

    /**
     * @dev returns the total borrows on the reserve
     * @param _reserve the reserve object
     * @return the total borrows (stable + variable)
     **/
    function getTotalBorrows(
        CoreLibrary.ReserveData storage _reserve
    ) internal view returns (uint256) {
        return _reserve.totalBorrowsVariable;
    }

    /**
     * @dev calculates the compounded borrow balance of a user
     * @param _self the userReserve object
     * @param _reserve the reserve object
     * @return the user compounded borrow balance
     **/
    function getCompoundedBorrowBalance(
        CoreLibrary.UserReserveData storage _self,
        CoreLibrary.ReserveData storage _reserve
    ) internal view returns (uint256) {
        if (_self.principalBorrowBalance == 0) return 0;

        uint256 principalBorrowBalanceRay = _self
            .principalBorrowBalance
            .wadToRay();
        uint256 compoundedBalance = 0;
        uint256 cumulatedInterest = 0;

        // TODO: handle stable?
        //        if (_self.stableBorrowRate > 0) {
        //            cumulatedInterest = calculateCompoundedInterest(
        //                _self.stableBorrowRate,
        //                _self.lastUpdateTimestamp
        //            );
        //        } else {
        //variable interest
        cumulatedInterest = calculateCompoundedInterest(
            _reserve.currentVariableBorrowRate,
            _reserve.lastUpdateTimestamp
        ).rayMul(_reserve.lastVariableBorrowCumulativeIndex).rayDiv(
                _self.lastVariableBorrowCumulativeIndex
            );
        //        }

        compoundedBalance = principalBorrowBalanceRay
            .rayMul(cumulatedInterest)
            .rayToWad();

        if (compoundedBalance == _self.principalBorrowBalance) {
            //solium-disable-next-line
            if (_self.lastUpdateTimestamp != block.timestamp) {
                //no interest cumulation because of the rounding - we add 1 wei
                //as symbolic cumulated interest to avoid interest free loans.

                return _self.principalBorrowBalance.add(1 wei);
            }
        }

        return compoundedBalance;
    }

    /**
     * @dev increases the total borrows at a variable rate
     * @param _reserve the reserve object
     * @param _amount the amount to add to the total borrows variable
     **/
    function increaseTotalBorrowsVariable(
        ReserveData storage _reserve,
        uint256 _amount
    ) internal {
        _reserve.totalBorrowsVariable = _reserve.totalBorrowsVariable.add(
            _amount
        );
    }

    /**
     * @dev decreases the total borrows at a variable rate
     * @param _reserve the reserve object
     * @param _amount the amount to substract to the total borrows variable
     **/
    function decreaseTotalBorrowsVariable(
        ReserveData storage _reserve,
        uint256 _amount
    ) internal {
        require(
            _reserve.totalBorrowsVariable >= _amount,
            "The amount that is being subtracted from the variable total borrows is incorrect"
        );
        _reserve.totalBorrowsVariable = _reserve.totalBorrowsVariable.sub(
            _amount
        );
    }

    /**
     * @dev enables a reserve to be used as collateral
     * @param _self the reserve object
     * @param _baseLTVasCollateral the loan to value of the asset when used as collateral
     * !param _liquidationThreshold the threshold at which loans using this asset as collateral will be considered undercollateralized
     * !param _liquidationBonus the bonus liquidators receive to liquidate this asset
     **/
    function enableAsCollateral(
        ReserveData storage _self,
        uint256 _baseLTVasCollateral // TODO(liquidation): handle liquidation logic //        uint256 _liquidationThreshold, //        uint256 _liquidationBonus
    ) external {
        require(
            _self.usageAsCollateralEnabled == false,
            "Reserve is already enabled as collateral"
        );

        _self.usageAsCollateralEnabled = true;
        _self.baseLTVasCollateral = _baseLTVasCollateral;
        // TODO(liquidation): handle liquidation logic
        //        _self.liquidationThreshold = _liquidationThreshold;
        //        _self.liquidationBonus = _liquidationBonus;

        if (_self.lastLiquidityCumulativeIndex == 0)
            _self.lastLiquidityCumulativeIndex = WadRayMath.ray();
    }

    /**
     * @dev disables a reserve as collateral
     * @param _self the reserve object
     **/
    function disableAsCollateral(ReserveData storage _self) external {
        _self.usageAsCollateralEnabled = false;
    }
}
