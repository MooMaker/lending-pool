// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.19;

library EthAddressLib {
    // TODO: replace with something custom? Do we need this at all actually?
    /**
     * @dev returns the address used within the protocol to identify ETH
     * @return the address assigned to ETH
     */
    function ethAddress() internal pure returns (address) {
        return 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    }
}
