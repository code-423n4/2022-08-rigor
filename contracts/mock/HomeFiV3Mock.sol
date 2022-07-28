// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "./HomeFiV2Mock.sol";

// Test contract to check upgradability
contract HomeFiV3Mock is HomeFiV2Mock {
    event TrustedForwarderChangedWithSender(
        address _newForwarder,
        address _sender
    );

    uint256 public newVariable;

    // Override function
    function setTrustedForwarder(address _newForwarder)
        external
        override(HomeFiV2Mock)
    {
        trustedForwarder = _newForwarder;
        emit TrustedForwarderChangedWithSender(_newForwarder, _msgSender());
    }
}
