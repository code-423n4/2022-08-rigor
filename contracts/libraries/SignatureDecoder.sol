// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

/**
 * @title SignatureDecoder for HomeFi v2.5.0
 
 * @notice Decodes signatures that a encoded as bytes
 */
library SignatureDecoder {
    /**
    * @dev Recovers address who signed the message

    * @param messageHash bytes32 - keccak256 hash of message
    * @param messageSignatures bytes - concatenated message signatures
    * @param pos uint256 - which signature to read

    * @return address - recovered address
    */
    function recoverKey(
        bytes32 messageHash,
        bytes memory messageSignatures,
        uint256 pos
    ) internal pure returns (address) {
        if (messageSignatures.length % 65 != 0) {
            return (address(0));
        }

        uint8 v;
        bytes32 r;
        bytes32 s;
        (v, r, s) = signatureSplit(messageSignatures, pos);

        // If the version is correct return the signer address
        if (v != 27 && v != 28) {
            return (address(0));
        } else {
            // solium-disable-next-line arg-overflow
            return ecrecover(toEthSignedMessageHash(messageHash), v, r, s);
        }
    }

    function toEthSignedMessageHash(bytes32 hash)
        internal
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
            );
    }

    /**
    * @dev Divides bytes signature into `uint8 v, bytes32 r, bytes32 s`.
    * @dev Make sure to perform a bounds check for @param pos, to avoid out of bounds access on @param signatures

    * @param pos which signature to read. A prior bounds check of this parameter should be performed, to avoid out of bounds access
    * @param signatures concatenated rsv signatures
    */
    function signatureSplit(bytes memory signatures, uint256 pos)
        internal
        pure
        returns (
            uint8 v,
            bytes32 r,
            bytes32 s
        )
    {
        // The signature format is a compact form of:
        //   {bytes32 r}{bytes32 s}{uint8 v}
        // Compact means, uint8 is not padded to 32 bytes.
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let signaturePos := mul(0x41, pos)
            r := mload(add(signatures, add(signaturePos, 0x20)))
            s := mload(add(signatures, add(signaturePos, 0x40)))
            v := byte(0, mload(add(signatures, add(signaturePos, 0x60))))
        }

        // Version of signature should be 27 or 28, but 0 and 1 are also possible versions
        if (v < 27) {
            v += 27;
        }
    }
}
