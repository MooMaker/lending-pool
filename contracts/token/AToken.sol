// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";

import "../configuration/AddressesProvider.sol";


contract AToken is ERC20Wrapper {
    AddressesProvider public addressesProvider;

    address public underlyingAssetAddress;

    constructor(
        AddressesProvider _addressesProvider,
        IERC20 _underlyingAsset,
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) ERC20Wrapper(_underlyingAsset) {
        addressesProvider = _addressesProvider;
        underlyingAssetAddress = address(_underlyingAsset);
    }
}
