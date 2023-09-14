// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./configuration/AddressesProvider.sol";

contract LendingPool {
    AddressesProvider public addressesProvider;

    constructor(AddressesProvider _addressesProvider) public {
        addressesProvider = _addressesProvider;
    }
}
