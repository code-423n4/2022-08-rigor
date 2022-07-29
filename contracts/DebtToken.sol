// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {IDebtToken, IERC20Upgradeable} from "./interfaces/IDebtToken.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/**
 * @title ERC20 for wrapping collateral currencies loaned to projects in HomeFi v2.5.0
 */
contract DebtToken is IDebtToken, ERC20Upgradeable {
    /*******************************************************************************
     * ---------------------FIXED INTERNAL STORED PROPERTIES---------------------- *
     *******************************************************************************/

    uint8 internal _decimals;

    /*******************************************************************************
     * ----------------------FIXED PUBLIC STORED PROPERTIES----------------------- *
     *******************************************************************************/

    /// @inheritdoc IDebtToken
    address public override communityContract;

    /*******************************************************************************
     * ---------------------------------MODIFIERS--------------------------------- *
     *******************************************************************************/

    modifier onlyCommunityContract() {
        // Revert if caller is not community contract
        require(
            communityContract == _msgSender(),
            "DebtToken::!CommunityContract"
        );
        _;
    }

    /*******************************************************************************
     * ---------------------------EXTERNAL TRANSACTIONS--------------------------- *
     *******************************************************************************/

    /// @inheritdoc IDebtToken
    function initialize(
        address _communityContract,
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) external override initializer {
        // Revert if _communityContract is zero address. Invalid address.
        require(_communityContract != address(0), "DebtToken::0 address");

        // Initialize ERC20
        __ERC20_init(name_, symbol_);

        // Store details
        _decimals = decimals_;
        communityContract = _communityContract;
    }

    /// @inheritdoc IDebtToken
    function mint(address _to, uint256 _total)
        external
        override
        onlyCommunityContract
    {
        _mint(_to, _total);
    }

    /// @inheritdoc IDebtToken
    function burn(address _to, uint256 _total)
        external
        override
        onlyCommunityContract
    {
        _burn(_to, _total);
    }

    /*******************************************************************************
     * -------------------------------PUBLIC VIEWS-------------------------------- *
     *******************************************************************************/

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /*******************************************************************************
     * ----------------------------PUBLIC TRANSACTIONS---------------------------- *
     *******************************************************************************/

    /// @notice blocked implementation
    function transferFrom(
        address, /* _sender */
        address, /* _recipient */
        uint256 /* _amount */
    ) public pure override(ERC20Upgradeable, IERC20Upgradeable) returns (bool) {
        revert("DebtToken::blocked");
    }

    /// @notice blocked implementation
    function transfer(
        address, /* recipient */
        uint256 /* amount */
    ) public pure override(ERC20Upgradeable, IERC20Upgradeable) returns (bool) {
        revert("DebtToken::blocked");
    }
}
