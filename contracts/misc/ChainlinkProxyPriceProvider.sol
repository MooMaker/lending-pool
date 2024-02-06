// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracleGetter} from "../interfaces/IPriceOracleGetter.sol";
import {IChainlinkAggregator} from "../interfaces/IChainlinkAggregator.sol";
import {EthAddressLib} from "../libraries/EthAddressLib.sol";

contract ChainLinkProxyPriceProvider is IPriceOracleGetter, Ownable {
    event AssetSourceUpdated(address indexed asset, address indexed source);
    event FallbackOracleUpdated(address indexed fallbackOracle);

    mapping(address => IChainlinkAggregator) private assetsSources;
    IPriceOracleGetter private fallbackOracle;

    /// @notice Constructor
    /// @param _assets The addresses of the assets
    /// @param _sources The address of the source of each asset
    constructor(
        address[] memory _assets,
        address[] memory _sources,
        address _fallbackOracle
    ) {
        internalSetFallbackOracle(_fallbackOracle);
        internalSetAssetsSources(_assets, _sources);
    }

    /// @notice Internal function to set the sources for each asset
    /// @param _assets The addresses of the assets
    /// @param _sources The address of the source of each asset
    function internalSetAssetsSources(
        address[] memory _assets,
        address[] memory _sources
    ) internal {
        require(
            _assets.length == _sources.length,
            "INCONSISTENT_PARAMS_LENGTH"
        );
        for (uint256 i = 0; i < _assets.length; i++) {
            assetsSources[_assets[i]] = IChainlinkAggregator(_sources[i]);
            emit AssetSourceUpdated(_assets[i], _sources[i]);
        }
    }

    /// @notice Internal function to set the fallbackOracle
    /// @param _fallbackOracle The address of the fallbackOracle
    function internalSetFallbackOracle(address _fallbackOracle) internal {
        fallbackOracle = IPriceOracleGetter(_fallbackOracle);
        emit FallbackOracleUpdated(_fallbackOracle);
    }

    /// @notice Gets an asset price by address
    /// @param _asset The asset address
    function getAssetPrice(address _asset) public view returns (uint256) {
        IChainlinkAggregator source = assetsSources[_asset];
        if (_asset == EthAddressLib.ethAddress()) {
            return 1 ether;
        } else {
            // If there is no registered source for the asset, call the fallbackOracle
            if (address(source) == address(0)) {
                return IPriceOracleGetter(fallbackOracle).getAssetPrice(_asset);
            } else {
                int256 _price = IChainlinkAggregator(source).latestAnswer();
                if (_price > 0) {
                    return uint256(_price);
                } else {
                    return
                        IPriceOracleGetter(fallbackOracle).getAssetPrice(
                            _asset
                        );
                }
            }
        }
    }
}
