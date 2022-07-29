// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @title Interface for ERC20 for wrapping collateral currencies loaned to projects in HomeFi
 */
interface IDebtToken is IERC20Upgradeable {
    /**
     * @notice Initialize a new communities contract

     * @dev modifier initializer

     * @param _communityContract address - address of deployed community contract
     * @param _name string - The name of the token
     * @param _symbol string - The symbol of the token
     * @param _decimals uint8 - decimal precision of the token
     */
    function initialize(
        address _communityContract,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) external;

    /**
     * @notice Create new tokens and sent to an address

     * @dev modifier onlyCommunityContract

     * @param _to address - the address receiving the minted tokens
     * @param _total uint256 - the amount of tokens to mint to _to
     */
    function mint(address _to, uint256 _total) external;

    /**
     * @notice Destroy tokens at an address

     * @dev modifier onlyCommunityContract

     * @param _to address - the address where tokens are burned from
     * @param _total uint256 - the amount of tokens to burn from _to
     */
    function burn(address _to, uint256 _total) external;

    /// @notice Returns address of community contract
    function communityContract() external view returns (address);
}
