// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./configuration/AddressesProvider.sol";
import "./libraries/CoreLibrary.sol";
import "./libraries/EthAddressLib.sol";
import "./interfaces/IReserveInterestRateStrategy.sol";

contract LendingPoolCore {
    using SafeMath for uint256;

    using CoreLibrary for CoreLibrary.ReserveData;

    AddressesProvider public addressesProvider;

    address public lendingPoolAddress;
    mapping(address => CoreLibrary.ReserveData) internal reserves;

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
    modifier onlyLendingPool {
        require(lendingPoolAddress == msg.sender, "The caller must be a lending pool contract");
        _;
    }

    constructor(AddressesProvider _addressesProvider) {
        addressesProvider = _addressesProvider;
        refreshConfigInternal();
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
        uint256 _amount
        /* bool _isFirstDeposit */
    ) external onlyLendingPool {
        // As the time passes by, pool accrues some interest, and we want to know
        // total accrued interest since the last update:
        // - interest to be paid to the depositors
        // - interest to be paid by the borrowers
        reserves[_reserve].updateCumulativeIndexes();
        updateReserveInterestRatesAndTimestampInternal(_reserve, _amount, 0);

        // TODO: do we need it?
//        if (_isFirstDeposit) {
//            //if this is the first deposit of the user, we configure the deposit as enabled to be used as collateral
//            setUserUseReserveAsCollateral(_reserve, _user, true);
//        }
    }

    /**
    * @dev gets the normalized income of the reserve. a value of 1e27 means there is no income. A value of 2e27 means there
    * there has been 100% income.
    * @param _reserve the reserve address
    * @return the reserve normalized income
    **/
    function getReserveNormalizedIncome(address _reserve) external view returns (uint256) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        return reserve.getNormalizedIncome();
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

        (uint256 newLiquidityRate, uint256 newVariableRate) = interestRateStrategy
            .calculateInterestRates(
                _reserve,
                getReserveAvailableLiquidity(_reserve)
                    .add(_liquidityAdded)
                    .sub(_liquidityTaken),
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
    * @dev gets the available liquidity in the reserve. The available liquidity is the balance of the core contract
    * @param _reserve the reserve address
    * @return the available liquidity
    **/
    function getReserveAvailableLiquidity(address _reserve) public view returns (uint256) {
        uint256 balance = 0;

        if (_reserve == EthAddressLib.ethAddress()) {
            balance = address(this).balance;
        } else {
            balance = IERC20(_reserve).balanceOf(address(this));
        }
        return balance;
    }

    /**
    * @dev updates the internal configuration of the core
    **/
    function refreshConfigInternal() internal {
        lendingPoolAddress = addressesProvider.getLendingPool();
    }

    /**
    * @dev gets the aToken contract address for the reserve
    * @param _reserve the reserve address
    * @return the address of the aToken contract
    **/
    function getReserveATokenAddress(address _reserve) public view returns (address) {
        CoreLibrary.ReserveData storage reserve = reserves[_reserve];
        return reserve.aTokenAddress;
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
}
