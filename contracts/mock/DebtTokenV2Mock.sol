// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "../DebtToken.sol";

// Test contract to check upgradability
contract DebtTokenV2Mock is DebtToken {
    // New state variable
    bool public newVariable;

    // New function
    function setNewVariable() external {
        newVariable = true;
    }
}
