// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {IHomeFi} from "./interfaces/IHomeFi.sol";
import {Project} from "./Project.sol";
import {IProjectFactory} from "./interfaces/IProjectFactory.sol";
import {ClonesUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import {Initializable, ERC2771ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";

/**
 * @title ProjectFactory for HomeFi v2.5.0

 * @dev This contract is used by HomeFi to create cheap clones of Project contract underlying
 */
contract ProjectFactory is
    IProjectFactory,
    Initializable,
    ERC2771ContextUpgradeable
{
    /*******************************************************************************
     * -------------------------PUBLIC STORED PROPERTIES-------------------------- *
     *******************************************************************************/

    /// @inheritdoc IProjectFactory
    address public override underlying;
    /// @inheritdoc IProjectFactory
    address public override homeFi;

    /*******************************************************************************
     * ---------------------------------MODIFIERS--------------------------------- *
     *******************************************************************************/

    modifier nonZero(address _address) {
        // Ensure an address is not the zero address (0x00)
        require(_address != address(0), "PF::0 address");
        _;
    }

    /*******************************************************************************
     * ---------------------------EXTERNAL TRANSACTIONS--------------------------- *
     *******************************************************************************/

    /// @inheritdoc IProjectFactory
    function initialize(address _underlying, address _homeFi)
        external
        override
        initializer
        nonZero(_underlying)
        nonZero(_homeFi)
    {
        // Store details
        underlying = _underlying;
        homeFi = _homeFi;
    }

    /// @inheritdoc IProjectFactory
    function changeProjectImplementation(address _underlying)
        external
        override
        nonZero(_underlying)
    {
        // Revert if sender is not HomeFi admin
        require(
            _msgSender() == IHomeFi(homeFi).admin(),
            "ProjectFactory::!Owner"
        );

        // Update details
        underlying = _underlying;
    }

    /*******************************************************************************
     * ------------------------------EXTERNAL VIEWS------------------------------- *
     *******************************************************************************/

    /// @inheritdoc IProjectFactory
    function createProject(address _currency, address _sender)
        external
        override
        returns (address _clone)
    {
        // Revert if sender is not HomeFi
        require(_msgSender() == homeFi, "PF::!HomeFiContract");

        // Create clone of Project implementation
        _clone = ClonesUpgradeable.clone(underlying);

        // Initialize project
        Project(_clone).initialize(_currency, _sender, homeFi);
    }

    /*******************************************************************************
     * -------------------------------PUBLIC VIEWS-------------------------------- *
     *******************************************************************************/

    /// @inheritdoc IProjectFactory
    function isTrustedForwarder(address _forwarder)
        public
        view
        override(ERC2771ContextUpgradeable, IProjectFactory)
        returns (bool)
    {
        return IHomeFi(homeFi).isTrustedForwarder(_forwarder);
    }
}
