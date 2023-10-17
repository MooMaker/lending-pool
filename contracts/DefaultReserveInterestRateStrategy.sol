// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

import "./interfaces/IReserveInterestRateStrategy.sol";
import "./libraries/WadRayMath.sol";
import "./configuration/AddressesProvider.sol";
import "./LendingPoolCore.sol";

/**
 * @title DefaultReserveInterestRateStrategy contract
 * @notice implements the calculation of the interest rates depending on the reserve parameters.
 * @dev if there is need to update the calculation of the interest rates for a specific reserve,
 * a new version of this contract will be deployed.
 * @author Aave
 **/
contract DefaultReserveInterestRateStrategy is IReserveInterestRateStrategy {
    using WadRayMath for uint256;
    using SafeMath for uint256;

    /**
     * @dev this constant represents the utilization rate at which the pool aims to obtain most competitive borrow rates
     * expressed in ray
     **/
    uint256 public constant OPTIMAL_UTILIZATION_RATE = 0.8 * 1e27;

    /**
     * @dev this constant represents the excess utilization rate above the optimal. It's always equal to
     * 1-optimal utilization rate. Added as a constant here for gas optimizations
     * expressed in ray
     **/

    uint256 public constant EXCESS_UTILIZATION_RATE = 0.2 * 1e27;

    AddressesProvider public addressesProvider;

    //base variable borrow rate when Utilization rate = 0. Expressed in ray
    uint256 public baseVariableBorrowRate;

    //slope of the variable interest curve when utilization rate > 0 and <= OPTIMAL_UTILIZATION_RATE. Expressed in ray
    uint256 public variableRateSlope1;

    //slope of the variable interest curve when utilization rate > OPTIMAL_UTILIZATION_RATE. Expressed in ray
    uint256 public variableRateSlope2;

    address public reserve;

    constructor(
        address _reserve,
        AddressesProvider _provider,
        uint256 _baseVariableBorrowRate,
        uint256 _variableRateSlope1,
        uint256 _variableRateSlope2
    ) {
        addressesProvider = _provider;
        baseVariableBorrowRate = _baseVariableBorrowRate;
        variableRateSlope1 = _variableRateSlope1;
        variableRateSlope2 = _variableRateSlope2;
        reserve = _reserve;
    }

    /**
    @dev accessors
     */

    function getBaseVariableBorrowRate() external view returns (uint256) {
        return baseVariableBorrowRate;
    }

    function getVariableRateSlope1() external view returns (uint256) {
        return variableRateSlope1;
    }

    function getVariableRateSlope2() external view returns (uint256) {
        return variableRateSlope2;
    }

    /**
     * @dev calculates the interest rates depending on the available liquidity and the total borrowed.
     * @param _reserve the address of the reserve
     * @param _availableLiquidity the liquidity available in the reserve
     * @param _totalBorrowsVariable the total borrowed from the reserve at a variable rate
     * @return currentLiquidityRate - the liquidity rate
     * @return currentVariableBorrowRate - stable borrow rate
     **/
    function calculateInterestRates(
        address _reserve,
        uint256 _availableLiquidity,
        uint256 _totalBorrowsVariable
    )
        external
        view
        returns (
            uint256 currentLiquidityRate,
            uint256 currentVariableBorrowRate
        )
    {
        uint256 totalBorrows = _totalBorrowsVariable;

        uint256 utilizationRate = (totalBorrows == 0 &&
            _availableLiquidity == 0)
            ? 0
            : totalBorrows.rayDiv(_availableLiquidity.add(totalBorrows));

        if (utilizationRate > OPTIMAL_UTILIZATION_RATE) {
            uint256 excessUtilizationRateRatio = utilizationRate
                .sub(OPTIMAL_UTILIZATION_RATE)
                .rayDiv(EXCESS_UTILIZATION_RATE);

            currentVariableBorrowRate = baseVariableBorrowRate
                .add(variableRateSlope1)
                .add(variableRateSlope2.rayMul(excessUtilizationRateRatio));
        } else {
            currentVariableBorrowRate = baseVariableBorrowRate.add(
                utilizationRate.rayDiv(OPTIMAL_UTILIZATION_RATE).rayMul(
                    variableRateSlope1
                )
            );
        }

        if (_totalBorrowsVariable != 0) {
            currentLiquidityRate = currentVariableBorrowRate.rayMul(
                utilizationRate
            );
        }
    }
}
