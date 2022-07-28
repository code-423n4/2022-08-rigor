// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "../Disputes.sol";

// Test contract to check upgradability
contract DisputesV2Mock is Disputes {
    // New state variable
    bool public newVariable;

    // New function
    function setNewVariable() external {
        newVariable = true;
    }
}
