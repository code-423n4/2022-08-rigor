// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "../Project.sol";

// Test contract to check upgradability
contract ProjectV2Mock is Project {
    // New state variable
    bool public newVariable;

    // New function
    function setNewVariable() external {
        newVariable = true;
    }
}
