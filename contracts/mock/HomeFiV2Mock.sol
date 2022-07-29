// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "./HomeFiMock.sol";

// Test contract to check upgradability
contract HomeFiV2Mock is HomeFiMock {
    event TrustedForwarderChanged(address _newForwarder);

    // New state variable
    bool public addrSet2;

    // New state variable
    uint256 public counter;

    // New function
    function setAddrFalse() external {
        require(!addrSet2, "Already set once");
        addrSet = false;
        addrSet2 = true;
    }

    // New function
    function incrementCounter() external {
        counter++;
    }

    // Override function
    function setTrustedForwarder(address _newForwarder)
        external
        virtual
        override(HomeFiMock)
        onlyAdmin
    {
        trustedForwarder = _newForwarder;
        emit TrustedForwarderChanged(_newForwarder);
    }
}
