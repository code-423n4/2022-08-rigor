// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import "../libraries/SignatureDecoder.sol";

library SignatureDecoderMock {
    function recoverKey(
        bytes32 messageHash,
        bytes memory messageSignatures,
        uint256 pos
    ) external pure returns (address _recoveredAddress) {
        _recoveredAddress = SignatureDecoder.recoverKey(
            messageHash,
            messageSignatures,
            pos
        );
    }
}
