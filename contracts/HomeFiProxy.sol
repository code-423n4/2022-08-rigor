// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title HomeFiProxy Contract for HomeFi v2.5.0

 * @dev This contract provided functionality to update the core HomeFi contracts.
 */
contract HomeFiProxy is OwnableUpgradeable {
    /*******************************************************************************
     * -------------------------PUBLIC STORED PROPERTIES-------------------------- *
     *******************************************************************************/

    /// @notice Address of proxy admin
    ProxyAdmin public proxyAdmin;

    /// @notice bytes2 array of upgradable contracts initials
    bytes2[] public allContractNames;

    /*******************************************************************************
     * ------------------------INTERNAL STORED PROPERTIES------------------------- *
     *******************************************************************************/

    /// @dev mapping that tell if a particular address is active(latest version of contract)
    mapping(address => bool) internal contractsActive;

    /// @dev mapping that maps contract initials with there implementation address
    mapping(bytes2 => address payable) internal contractAddress;

    /*******************************************************************************
     * ---------------------------------MODIFIERS--------------------------------- *
     *******************************************************************************/

    /// @dev check _address should not be zero address
    modifier nonZero(address _address) {
        require(_address != address(0), "Proxy::0 address");
        _;
    }

    /*******************************************************************************
     * ---------------------------EXTERNAL TRANSACTIONS--------------------------- *
     *******************************************************************************/

    /**
     * @notice Initialize all the homeFi contract in the correct sequential order and generate upgradable proxy for them.

     * @dev Can only be called by HomeFiProxy owner.
     * @dev modifier initializer
     * @dev if more contract are added in homeFi, then their entry can be done here. 

     * @param _implementations the implementation address of homeFi smart contract in correct sequence.
     */
    function initiateHomeFi(address[] calldata _implementations)
        external
        initializer
    {
        // Initialize ownable
        __Ownable_init();

        // Create new proxy admin contract
        proxyAdmin = new ProxyAdmin();

        // Initial contract names
        allContractNames.push("HF"); // HomeFi
        allContractNames.push("CN"); // Community
        allContractNames.push("DP"); // Disputes
        allContractNames.push("PF"); // Project Factory
        allContractNames.push("DA"); // rDAI
        allContractNames.push("US"); // rUSDC
        allContractNames.push("NT"); // native token rETH - rXDAI

        // Local instance of variable. For saving gas.
        uint256 _length = allContractNames.length;

        // Revert if _implementations length is wrong. Indicating wrong set of _implementations.
        require(_length == _implementations.length, "Proxy::Lengths !match");

        // Mark this contract as active
        contractsActive[address(this)] = true;

        // Generate proxy for all implementation
        for (uint256 i = 0; i < _length; i++) {
            _generateProxy(allContractNames[i], _implementations[i]);
        }
    }

    /**
     * @notice Adds a new contract type/implementation to HomeFi

     * @dev modifier onlyOwner

     * @param _contractName initial of contract to be added
     * @param _contractAddress address of contract implementation to be added.
     */
    function addNewContract(bytes2 _contractName, address _contractAddress)
        external
        onlyOwner
    {
        // Revert if _contractName is already in use.
        require(
            contractAddress[_contractName] == address(0),
            "Proxy::Name !OK"
        );

        // Add to allContractNames
        allContractNames.push(_contractName);

        // Generate proxy
        _generateProxy(_contractName, _contractAddress);
    }

    /**
     * @notice Upgrades a multiple contract implementations. Replaces old implementation with new.

     * @dev modifier onlyOwner

     * @param _contractNames bytes2 array of contract initials that needs to be upgraded
     * @param _contractAddresses address array of contract implementation address that needs to be upgraded
     */
    function upgradeMultipleImplementations(
        bytes2[] calldata _contractNames,
        address[] calldata _contractAddresses
    ) external onlyOwner {
        // Local instance of variable. For saving gas.
        uint256 _length = _contractNames.length;

        // Revert if _contractNames and _contractAddresses length mismatch
        require(_length == _contractAddresses.length, "Proxy::Lengths !match");

        // Replace implementations
        for (uint256 i = 0; i < _length; i++) {
            _replaceImplementation(_contractNames[i], _contractAddresses[i]);
        }
    }

    /**
     * @notice Allows HomeFiProxy owner to change the owner of proxyAdmin contract.
     * This can be useful when trying to deploy new version of HomeFiProxy

     * @dev modifier onlyOwner
     * @dev modifier nonZero with _newAdmin

     * @param _newAdmin address of new proxyAdmin owner / new version of HomeFiProxy
     */
    function changeProxyAdminOwner(address _newAdmin)
        external
        onlyOwner
        nonZero(_newAdmin)
    {
        // Transfer ownership to new admin.
        proxyAdmin.transferOwnership(_newAdmin);
    }

    /*******************************************************************************
     * ------------------------------EXTERNAL VIEWS------------------------------- *
     *******************************************************************************/

    /**
     * @notice To check if we use the particular contract.
     * @param _address The contract address to check if it is active or not.
     * @return true if _address is active else false
     */
    function isActive(address _address) external view returns (bool) {
        return contractsActive[_address];
    }

    /**
     * @notice Gets latest contract address
     * @param _contractName Contract name to fetch
     * @return current implementation address corresponding to _contractName
     */
    function getLatestAddress(bytes2 _contractName)
        external
        view
        returns (address)
    {
        return contractAddress[_contractName];
    }

    /*******************************************************************************
     * ---------------------------INTERNAL TRANSACTIONS--------------------------- *
     *******************************************************************************/

    /**
     * @dev Replaces the implementations of the contract.
     * @dev modifier nonZero with _contractAddress

     * @param _contractName The name of the contract.

     * @param _contractAddress The address of the contract to replace the implementations for.
     */
    function _replaceImplementation(
        bytes2 _contractName,
        address _contractAddress
    ) internal nonZero(_contractAddress) {
        // Upgrade proxy
        proxyAdmin.upgrade(
            TransparentUpgradeableProxy(contractAddress[_contractName]),
            _contractAddress
        );
    }

    /**
     * @dev generates upgradable proxy
     * @dev modifier nonZero with _contractAddress

     * @param _contractName initial of the contract

     * @param _contractAddress of the proxy
     */
    function _generateProxy(bytes2 _contractName, address _contractAddress)
        internal
        nonZero(_contractAddress)
    {
        // Deploys new TransparentUpgradeableProxy for implementation
        TransparentUpgradeableProxy tempInstance = new TransparentUpgradeableProxy(
                _contractAddress,
                address(proxyAdmin),
                bytes("")
            );

        // Store details
        contractAddress[_contractName] = payable(address(tempInstance));
        contractsActive[address(tempInstance)] = true;
    }
}
