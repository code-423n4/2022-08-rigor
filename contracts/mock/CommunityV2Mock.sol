// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "../Community.sol";

// Test contract to check upgradability
contract CommunityV2Mock is Community {
    // New state variable
    bool public newVariable;

    // New function
    function setNewVariable() external {
        newVariable = true;
    }
}
