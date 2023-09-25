// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./WadRayMath.sol";

library CoreLibrary {
    using SafeMath for uint256;
    using WadRayMath for uint256;

    uint256 internal constant SECONDS_PER_YEAR = 365 days;

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
        /**
        * @dev address of the interest rate strategy contract
        **/
        address interestRateStrategyAddress;
        /**
        * @dev address of the aToken representing the asset
        **/
        address aTokenAddress;
        uint40 lastUpdateTimestamp;
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
        require(_self.aTokenAddress == address(0), "Reserve has already been initialized");

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
    function getNormalizedIncome(CoreLibrary.ReserveData storage _reserve)
        internal
        view
        returns (uint256)
    {
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
            _self.lastLiquidityCumulativeIndex = cumulatedLiquidityInterest.rayMul(
                _self.lastLiquidityCumulativeIndex
            );

            uint256 cumulatedVariableBorrowInterest = calculateCompoundedInterest(
                _self.currentVariableBorrowRate,
                _self.lastUpdateTimestamp
            );
            _self.lastVariableBorrowCumulativeIndex = cumulatedVariableBorrowInterest.rayMul(
                _self.lastVariableBorrowCumulativeIndex
            );
        }
    }

    /**
    * @dev function to calculate the interest using a linear interest rate formula
    * @param _rate the interest rate, in ray
    * @param _lastUpdateTimestamp the timestamp of the last update of the interest
    * @return the interest rate linearly accumulated during the timeDelta, in ray
    **/
    function calculateLinearInterest(uint256 _rate, uint40 _lastUpdateTimestamp)
        internal
        view
        returns (uint256)
    {
        //solium-disable-next-line
        uint256 timeDifference = block.timestamp.sub(uint256(_lastUpdateTimestamp));

        uint256 timeDelta = timeDifference.wadToRay().rayDiv(SECONDS_PER_YEAR.wadToRay());

        return _rate.rayMul(timeDelta).add(WadRayMath.ray());
    }

    /**
    * @dev function to calculate the interest using a compounded interest rate formula
    * @param _rate the interest rate, in ray
    * @param _lastUpdateTimestamp the timestamp of the last update of the interest
    * @return the interest rate compounded during the timeDelta, in ray
    **/
    function calculateCompoundedInterest(uint256 _rate, uint40 _lastUpdateTimestamp)
        internal
        view
        returns (uint256)
    {
        //solium-disable-next-line
        uint256 timeDifference = block.timestamp.sub(uint256(_lastUpdateTimestamp));

        uint256 ratePerSecond = _rate.div(SECONDS_PER_YEAR);

        return ratePerSecond.add(WadRayMath.ray()).rayPow(timeDifference);
    }

    /**
    * @dev returns the total borrows on the reserve
    * @param _reserve the reserve object
    * @return the total borrows (stable + variable)
    **/
    function getTotalBorrows(CoreLibrary.ReserveData storage _reserve)
        internal
        view
        returns (uint256)
    {
        return _reserve.totalBorrowsVariable;
    }
}
