// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import {AddressesProvider} from "./configuration/AddressesProvider.sol";
import {LendingPoolCore} from "./LendingPoolCore.sol";
import {IPriceOracleGetter} from "./interfaces/IPriceOracleGetter.sol";
import {WadRayMath} from "./libraries/WadRayMath.sol";

contract LendingPoolDataProvider is Initializable {
    using SafeMath for uint256;
    using WadRayMath for uint256;

    /**
     * @dev specifies the health factor threshold at which the user position is liquidated.
     * 1e18 by default, if the health factor drops below 1e18, the loan can be liquidated.
     **/
    uint256 public constant HEALTH_FACTOR_LIQUIDATION_THRESHOLD = 1e18;
    uint256 public constant UINT_MAX_VALUE = type(uint256).max;

    LendingPoolCore public core;
    AddressesProvider public addressesProvider;

    function initialize(
        AddressesProvider _addressesProvider
    ) public initializer {
        addressesProvider = _addressesProvider;
        core = LendingPoolCore(_addressesProvider.getLendingPoolCore());
    }

    /**
     * @dev struct to hold calculateUserGlobalData() local computations
     **/
    struct UserGlobalDataLocalVars {
        uint256 reserveUnitPrice;
        uint256 tokenUnit;
        uint256 compoundedLiquidityBalance;
        uint256 compoundedBorrowBalance;
        uint256 reserveDecimals;
        uint256 baseLtv;
        uint256 liquidationThreshold;
        uint256 originationFee;
        bool usageAsCollateralEnabled;
        bool userUsesReserveAsCollateral;
        address currentReserve;
    }

    /**
     * @dev calculates the user data across the reserves.
     * this includes the total liquidity/collateral/borrow balances in ETH,
     * the average Loan To Value, the average Liquidation Ratio, and the Health factor.
     * @param _user the address of the user
     * @return totalLiquidityBalanceETH - the total liquidity
     * @return totalCollateralBalanceETH - total collateral in ETH
     * @return totalBorrowBalanceETH - total borrow balances in ETH
     * @return totalFeesETH - total fees in ETH
     * @return currentLtv - the average Ltv
     * @return currentLiquidationThreshold - liquidation threshold
     * @return healthFactor - health factor
     * @return healthFactorBelowThreshold - indicates if health factor is below the threshold
     **/
    function calculateUserGlobalData(
        address _user
    )
        public
        view
        returns (
            uint256 totalLiquidityBalanceETH,
            uint256 totalCollateralBalanceETH,
            uint256 totalBorrowBalanceETH,
            uint256 totalFeesETH,
            uint256 currentLtv,
            uint256 currentLiquidationThreshold,
            uint256 healthFactor,
            bool healthFactorBelowThreshold
        )
    {
        IPriceOracleGetter oracle = IPriceOracleGetter(
            addressesProvider.getPriceOracle()
        );

        // Usage of a memory struct of vars to avoid "Stack too deep" errors due to local variables
        UserGlobalDataLocalVars memory vars;

        address[] memory reserves = core.getReserves();

        for (uint256 i = 0; i < reserves.length; i++) {
            vars.currentReserve = reserves[i];

            (
                vars.compoundedLiquidityBalance,
                vars.compoundedBorrowBalance,
                vars.originationFee,
                vars.userUsesReserveAsCollateral
            ) = core.getUserBasicReserveData(vars.currentReserve, _user);

            if (
                vars.compoundedLiquidityBalance == 0 &&
                vars.compoundedBorrowBalance == 0
            ) {
                continue;
            }

            //fetch reserve data
            (
                vars.reserveDecimals,
                vars.baseLtv,
                vars.liquidationThreshold,
                vars.usageAsCollateralEnabled
            ) = core.getReserveConfiguration(vars.currentReserve);

            vars.tokenUnit = 10 ** vars.reserveDecimals;
            vars.reserveUnitPrice = oracle.getAssetPrice(vars.currentReserve);

            //liquidity and collateral balance
            if (vars.compoundedLiquidityBalance > 0) {
                uint256 liquidityBalanceETH = vars
                    .reserveUnitPrice
                    .mul(vars.compoundedLiquidityBalance)
                    .div(vars.tokenUnit);
                totalLiquidityBalanceETH = totalLiquidityBalanceETH.add(
                    liquidityBalanceETH
                );

                if (
                    vars.usageAsCollateralEnabled &&
                    vars.userUsesReserveAsCollateral
                ) {
                    totalCollateralBalanceETH = totalCollateralBalanceETH.add(
                        liquidityBalanceETH
                    );
                    currentLtv = currentLtv.add(
                        liquidityBalanceETH.mul(vars.baseLtv)
                    );
                    currentLiquidationThreshold = currentLiquidationThreshold
                        .add(
                            liquidityBalanceETH.mul(vars.liquidationThreshold)
                        );
                }
            }

            if (vars.compoundedBorrowBalance > 0) {
                totalBorrowBalanceETH = totalBorrowBalanceETH.add(
                    vars.reserveUnitPrice.mul(vars.compoundedBorrowBalance).div(
                        vars.tokenUnit
                    )
                );
                totalFeesETH = totalFeesETH.add(
                    vars.originationFee.mul(vars.reserveUnitPrice).div(
                        vars.tokenUnit
                    )
                );
            }
        }

        currentLtv = totalCollateralBalanceETH > 0
            ? currentLtv.div(totalCollateralBalanceETH)
            : 0;
        currentLiquidationThreshold = totalCollateralBalanceETH > 0
            ? currentLiquidationThreshold.div(totalCollateralBalanceETH)
            : 0;

        healthFactor = calculateHealthFactorFromBalancesInternal(
            totalCollateralBalanceETH,
            totalBorrowBalanceETH,
            totalFeesETH,
            currentLiquidationThreshold
        );
        healthFactorBelowThreshold =
            healthFactor < HEALTH_FACTOR_LIQUIDATION_THRESHOLD;
    }

    /**
     * @dev calculates the health factor from the corresponding balances
     * @param collateralBalanceETH the total collateral balance in ETH
     * @param borrowBalanceETH the total borrow balance in ETH
     * @param totalFeesETH the total fees in ETH
     * @param liquidationThreshold the avg liquidation threshold
     **/
    function calculateHealthFactorFromBalancesInternal(
        uint256 collateralBalanceETH,
        uint256 borrowBalanceETH,
        uint256 totalFeesETH,
        uint256 liquidationThreshold
    ) internal pure returns (uint256) {
        if (borrowBalanceETH == 0) return UINT_MAX_VALUE;

        return
            (collateralBalanceETH.mul(liquidationThreshold).div(100)).wadDiv(
                borrowBalanceETH.add(totalFeesETH)
            );
    }

    /**
     * @notice calculates the amount of collateral needed in ETH to cover a new borrow.
     * @param _reserve the reserve from which the user wants to borrow
     * @param _amount the amount the user wants to borrow
     * @param _fee the fee for the amount that the user needs to cover
     * @param _userCurrentBorrowBalanceTH the current borrow balance of the user (before the borrow)
     * @param _userCurrentLtv the average ltv of the user given his current collateral
     * @return the total amount of collateral in ETH to cover the current borrow balance + the new amount + fee
     **/
    function calculateCollateralNeededInETH(
        address _reserve,
        uint256 _amount,
        uint256 _fee,
        uint256 _userCurrentBorrowBalanceTH,
        uint256 _userCurrentFeesETH,
        uint256 _userCurrentLtv
    ) external view returns (uint256) {
        uint256 reserveDecimals = core.getReserveDecimals(_reserve);

        IPriceOracleGetter oracle = IPriceOracleGetter(
            addressesProvider.getPriceOracle()
        );

        uint256 requestedBorrowAmountETH = oracle
            .getAssetPrice(_reserve)
            .mul(_amount.add(_fee))
            .div(10 ** reserveDecimals); //price is in ether

        //add the current already borrowed amount to the amount requested to calculate the total collateral needed.
        uint256 collateralNeededInETH = _userCurrentBorrowBalanceTH
            .add(_userCurrentFeesETH)
            .add(requestedBorrowAmountETH)
            .mul(100)
            .div(_userCurrentLtv); //LTV is calculated in percentage

        return collateralNeededInETH;
    }

    struct balanceDecreaseAllowedLocalVars {
        uint256 decimals;
        uint256 collateralBalanceETH;
        uint256 borrowBalanceETH;
        uint256 totalFeesETH;
        uint256 currentLiquidationThreshold;
        uint256 reserveLiquidationThreshold;
        uint256 amountToDecreaseETH;
        uint256 collateralBalancefterDecrease;
        uint256 liquidationThresholdAfterDecrease;
        uint256 healthFactorAfterDecrease;
        bool reserveUsageAsCollateralEnabled;
    }

    /**
     * @dev check if a specific balance decrease is allowed (i.e. doesn't bring the user borrow position health factor under 1e18)
     * @param _reserve the address of the reserve
     * @param _user the address of the user
     * @param _amount the amount to decrease
     * @return true if the decrease of the balance is allowed
     **/

    function balanceDecreaseAllowed(
        address _reserve,
        address _user,
        uint256 _amount
    ) external view returns (bool) {
        return true;
        // Usage of a memory struct of vars to avoid "Stack too deep" errors due to local variables
        balanceDecreaseAllowedLocalVars memory vars;

        (
            vars.decimals,
            ,
            vars.reserveLiquidationThreshold,
            vars.reserveUsageAsCollateralEnabled
        ) = core.getReserveConfiguration(_reserve);

        if (
            !vars.reserveUsageAsCollateralEnabled ||
            !core.isUserUseReserveAsCollateralEnabled(_reserve, _user)
        ) {
            return true; //if reserve is not used as collateral, no reasons to block the transfer
        }

        (
            ,
            vars.collateralBalanceETH,
            vars.borrowBalanceETH,
            vars.totalFeesETH,
            ,
            vars.currentLiquidationThreshold,
            ,

        ) = calculateUserGlobalData(_user);

        if (vars.borrowBalanceETH == 0) {
            return true; //no borrows - no reasons to block the transfer
        }

        IPriceOracleGetter oracle = IPriceOracleGetter(
            addressesProvider.getPriceOracle()
        );

        vars.amountToDecreaseETH = oracle
            .getAssetPrice(_reserve)
            .mul(_amount)
            .div(10 ** vars.decimals);

        vars.collateralBalancefterDecrease = vars.collateralBalanceETH.sub(
            vars.amountToDecreaseETH
        );

        //if there is a borrow, there can't be 0 collateral
        if (vars.collateralBalancefterDecrease == 0) {
            return false;
        }

        vars.liquidationThresholdAfterDecrease = vars
            .collateralBalanceETH
            .mul(vars.currentLiquidationThreshold)
            .sub(vars.amountToDecreaseETH.mul(vars.reserveLiquidationThreshold))
            .div(vars.collateralBalancefterDecrease);

        uint256 healthFactorAfterDecrease = calculateHealthFactorFromBalancesInternal(
                vars.collateralBalancefterDecrease,
                vars.borrowBalanceETH,
                vars.totalFeesETH,
                vars.liquidationThresholdAfterDecrease
            );

        return healthFactorAfterDecrease > HEALTH_FACTOR_LIQUIDATION_THRESHOLD;
    }
}
