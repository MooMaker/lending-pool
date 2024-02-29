// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IAddressesProvider.sol";
import "./AddressStorage.sol";

contract AddressesProvider is Ownable, IAddressesProvider, AddressStorage {
    //events
    event LendingPoolUpdated(address indexed newAddress);
    event LendingPoolCoreUpdated(address indexed newAddress);
    event PriceOracleUpdated(address indexed newAddress);
    event LendingPoolDataProviderUpdated(address indexed newAddress);
    event FeeProviderUpdated(address indexed newAddress);
    event TokenDistributorUpdated(address indexed newAddress);
    event LiquidationManagerUpdated(address indexed newAddress);

    bytes32 private constant LENDING_POOL = "LENDING_POOL";
    bytes32 private constant LENDING_POOL_CORE = "LENDING_POOL_CORE";
    bytes32 private constant PRICE_ORACLE = "PRICE_ORACLE";
    bytes32 private constant DATA_PROVIDER = "DATA_PROVIDER";
    bytes32 private constant FEE_PROVIDER = "FEE_PROVIDER";
    bytes32 private constant TOKEN_DISTRIBUTOR = "TOKEN_DISTRIBUTOR";
    bytes32 private constant LIQUIDATION_MANAGER = "LIQUIDATION_MANAGER";

    /**
     * @dev returns the address of the LendingPool proxy
     * @return the lending pool proxy address
     **/
    function getLendingPool() public view returns (address) {
        return getAddress(LENDING_POOL);
    }

    /**
     * @dev updates the implementation of the lending pool
     * @param _pool the new lending pool implementation
     **/
    function setLendingPoolImpl(address _pool) public onlyOwner {
        _setAddress(LENDING_POOL, _pool);
        emit LendingPoolUpdated(_pool);
    }

    /**
     * @dev returns the address of the LendingPoolCore
     * @return the lending pool core proxy address
     */
    function getLendingPoolCore() public view returns (address payable) {
        address payable core = payable(getAddress(LENDING_POOL_CORE));
        return core;
    }

    /**
     * @dev updates the implementation of the lending pool core
     * @param _lendingPoolCore the new lending pool core implementation
     **/
    function setLendingPoolCoreImpl(address _lendingPoolCore) public onlyOwner {
        _setAddress(LENDING_POOL_CORE, _lendingPoolCore);
        emit LendingPoolCoreUpdated(_lendingPoolCore);
    }

    function getPriceOracle() public view returns (address) {
        return getAddress(PRICE_ORACLE);
    }

    function setPriceOracle(address _priceOracle) public onlyOwner {
        _setAddress(PRICE_ORACLE, _priceOracle);
        emit PriceOracleUpdated(_priceOracle);
    }

    /**
     * @dev returns the address of the LendingPoolDataProvider proxy
     * @return the lending pool data provider proxy address
     */
    function getLendingPoolDataProvider() public view returns (address) {
        return getAddress(DATA_PROVIDER);
    }

    /**
     * @dev updates the implementation of the lending pool data provider
     * @param _provider the new lending pool data provider implementation
     **/
    function setLendingPoolDataProviderImpl(
        address _provider
    ) public onlyOwner {
        _setAddress(DATA_PROVIDER, _provider);
        emit LendingPoolDataProviderUpdated(_provider);
    }

    /**
     * @dev returns the address of the FeeProvider proxy
     * @return the address of the Fee provider proxy
     **/
    function getFeeProvider() public view returns (address) {
        return getAddress(FEE_PROVIDER);
    }

    /**
     * @dev updates the implementation of the FeeProvider proxy
     * @param _feeProvider the new lending pool fee provider implementation
     **/
    function setFeeProviderImpl(address _feeProvider) public onlyOwner {
        _setAddress(FEE_PROVIDER, _feeProvider);
        emit FeeProviderUpdated(_feeProvider);
    }

    function getTokenDistributor() public view returns (address) {
        return getAddress(TOKEN_DISTRIBUTOR);
    }

    function setTokenDistributor(address _tokenDistributor) public onlyOwner {
        _setAddress(TOKEN_DISTRIBUTOR, _tokenDistributor);
        emit TokenDistributorUpdated(_tokenDistributor);
    }

    /**
     * @dev returns the address of the LendingPoolLiquidationManager
     * @return the address of the LendingPoolLiquidationManager
     */
    function getLendingPoolLiquidationManager() public view returns (address) {
        return getAddress(LIQUIDATION_MANAGER);
    }

    /**
     * @dev updates the implementation of the LendingPoolLiquidationManager
     * @param _manager the new lending pool liquidation manager implementation
     **/
    function setLendingPoolLiquidationManager(
        address _manager
    ) public onlyOwner {
        _setAddress(LIQUIDATION_MANAGER, _manager);
        emit LiquidationManagerUpdated(_manager);
    }
}
