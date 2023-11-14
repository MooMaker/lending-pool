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
     * return healthFactor - health factor
     * return healthFactorBelowThreshold - indicates if health factor is below the threshold
     * also the average Ltv, liquidation threshold, and the health factor
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
            uint256 currentLiquidationThreshold
        )
    //            uint256 healthFactor,
    //            bool healthFactorBelowThreshold
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
        // TODO: calculate reserve health factor
        //
        //        healthFactor = calculateHealthFactorFromBalancesInternal(
        //            totalCollateralBalanceETH,
        //            totalBorrowBalanceETH,
        //            totalFeesETH,
        //            currentLiquidationThreshold
        //        );
        //        healthFactorBelowThreshold = healthFactor < HEALTH_FACTOR_LIQUIDATION_THRESHOLD;
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
            .add(requestedBorrowAmountETH);
        // TODO(liquidations): handle LTV
        //            .mul(100)
        //            .div(_userCurrentLtv); //LTV is calculated in percentage

        return collateralNeededInETH;
    }
}
