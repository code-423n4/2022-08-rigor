# Rigor Protocol contest details

- $47,500 USDC main award pot
- $2,500 USDC gas optimization award pot
- Join [C4 Discord](https://discord.gg/code4rena) to register
- Submit findings [using the C4 form](https://code4rena.com/contests/2022-08-rigor-protocol-contest/submit)
- [Read our guidelines for more details](https://docs.code4rena.com/roles/wardens)
- Starts August 01, 2022 20:00 UTC
- Ends August 06, 2022 20:00 UTC

| Glossary        |                                                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Builder         | One who contracts for and supervises the construction of real estate. Builders are the one to create projects                                                                                                                                                                 |
| Project         | Entity defined by a sum of tasks, a budget. It represents a real estate construction and is linked to a builder, contractor and subcontractor.                                                                                                                                |
| Contractor      | One that agrees to furnish materials or perform services at a specified price, especially for construction work. He is invited by a builder on a project. He can assign a subcontractor on project tasks. Builder can act as a contractor.                                    |
| Subcontractor   | One who agrees to perform the work specified in a project task. He is assigned to the task by the project's contractor. Contractor can act as a subcontractor.                                                                                                                |
| Community       | Entity with an owner and members aiming at providing loans to projects. Members can publish their projects to the community. A project can only be published to one community at a time.                                                                                      |
| Community owner | only member able to provide loans to published projects                                                                                                                                                                                                                       |
| Task            | Entity defined by a cost, a subcontractor, and a status. a task can be Inactive, Active or Complete. Tasks can be flagged as Allocated when budget for this task has bee provisioned. When subcontractor confirms the assignment on a task it is being flagged as SCConfirmed |
| Debt token      | ERC20 token mint and burn capable but with disabled transfer. Only the community contract is able to mint and burn these tokens. They represent the debt owned by the builder to the community owner when a loan has been supplied to the builder for a project               |
| HomeFi          | acronym for Home Finance it is the module where all the protocol modules are linked. Addresses of allowed currencies, project factory, community, treasury and dispute contracts are registered there.                                                                        |
| Token Currency  | Crypto currencies used for payment by the protocol. For native currencies like ETH or XDAI we use the wrapped version only.                                                                                                                                                   |

## Areas of specific concern in reviewing the code

The focus is to try and find any logic errors or ways to drain funds from the protocol in a way that is advantageous for an attacker at the expense of users with funds invested in the protocol.

Here are some areas that are of interest :

- signatures order/concatenation included in sensitive calls.
- meta transaction
- smart contract updates and clone factory
- debt issuance and interest calculation.
- malicious parties teaming up against other parties. i.e can a contractor and a subcontractor freeze or drain funds without the builder agreement ?
- funds sitting on project getting stuck.

## Protocol Overview

HomeFi protocol is a generalized protocol that provides public, permission less, decentralized financial infrastructure for home finance. Our mission is to make home finance open, accessible and positive-sum for everyone on earth.

The Protocol is divided into modules with different areas of concerns.

![HomeFi relationship between entities](https://github.com/code-423n4/2022-08-rigor/blob/main/doc/High%20Level%20Archi.png)

All modules are behind proxies. `HomeFi Proxy` is responsible for initializing all the modules contract in the correct sequential order and generate upgradable proxy for them.

To improve the user experience of construction professionals using the protocol, we implemented eip-2771 meta transactions thanks to OpenZeppelin base contracts.

## Flows

Here are some sequence diagrams for the main rigor flows.
Home builder will create a project and add tasks to the project. A per task budget is defined. The builder can publish the project to communities he is a member of. Community provide fix APR loans to builders .
Thanks to the loan tasks will be funded and each time a subcontractor completes them he will receive the assigned budget. Finally after selling the real estate the builder is able to repay the loan with interest.
Of course depending on the step different signatures will be required to execute the transaction onchain. The repayment can be mark as done off chain through an escrow and directly between the community owner (aka lender) and the builder.

## From project creation to community lending to the project

1. First a `builder` creates a `project` by calling the `createProject()` function on [HomeFi](https://github.com/code-423n4/2022-08-rigor/blob/main/contracts/HomeFi.sol).
   It will trigger the deployment of a new [project](contracts/Project.sol) thanks to the [project factory](https://github.com/code-423n4/2022-08-rigor/blob/main/contracts/ProjectFactory.sol).

2. `Builder` invites a `general contractor`. It requires signing data that includes the `contractor` address and the `project` address by both the `contractor` and the `builder`. The signatures and data are used to call `inviteContractor(bytes _data, bytes _signature)`

3. Builder add [tasks](https://github.com/code-423n4/2022-08-rigor/blob/main/contracts/libraries/Tasks.sol) to the project. It requires signing data that includes tasks costs, a hash (task metadata), tasks count and the `project` address. Both `builder` and `contractor` have to sign the data. The signatures and data are used to call `addTasks(bytes _data, bytes _signature)`

4. Community Owner creates a [community](https://github.com/code-423n4/2022-08-rigor/blob/main/contracts/Community.sol) by calling `createCommunity(bytes _hash, address _currency)` on the community contract where all the communities are registered. It requires the address of the currency used by the community for lending. The currency must be register in [HomeFi](contracts/HomeFi.sol) to be valid. It also requires a hash (community metadata).

5. `Builder` is invited to be a member of that new community by the `community owner`. They both have to sign data including the community ID, the new member address and a message hash (the message can be anything). The data and the signatures in the right order is required to call `addMember(bytes _data, bytes _signatures)` on the community contract. It will add the builder as a community member allowing its projects to be published in the community.

6. Builder publishes his project to the community. It requires signing data that
   includes community ID, APR, publishing fee and nonce . Both `builder` and `community owner` have to sign the data. The signatures and data are used to call `publishProject(bytes _data, bytes _signature)` .
   Note that you cannot submit a project with no total budget. Therefore it requires at least one task with a budget > 0.

7. **Optional** the builder can adjust the amount of the loan requested to a community by calling `toggleLendingNeeded(uint256 _communityID, address _project, uint256 _lendingNeeded)`

8. `Community owner` lends fund to the published project by calling `lendToProject(uint256 _cost)`. This call will update accrued interest, mint debt token for the community owner and transfer tokens to the project contract address.

![Community lend to project](https://github.com/code-423n4/2022-08-rigor/blob/main/doc/lend%20to%20project.png)

## Tasks completion and payment

1. Builder add [tasks](https://github.com/code-423n4/2022-08-rigor/blob/main/contracts/libraries/Tasks.sol) to the project. It requires signing data that includes tasks costs, a hash (task metadata), tasks count and the `project` address. Both `builder` and `contractor` have to sign the data. The signatures and data are used to call `addTasks(bytes _data, bytes _signature)`

2. `Contractor` assign tasks to `subcontractor` by calling `inviteSC(uint256[] _index, address[] _to)` providing tasks ID and subcontractor address. Subcontractor accepts by calling `acceptInviteSC(uint256[] _taskList)`.

3. Tasks need to be funded to be marked as completed. Although it can be funded through the community, the builder can also fund its project by calling directly `lendToProject(uint256 _cost)` on the project contract address.

4. Task is completed by calling `setComplete(bytes _data, bytes _signature)`. It requires signing data that includes task ID and the `project` address. `builder`, `contractor` and `subcontractor` have to sign the data. If there is no ongoing dispute about that project, task status is updated and payment is made. Indeed tokens are transferred from the project to the subcontractor's address.

![Task creation and completion](https://github.com/code-423n4/2022-08-rigor/blob/main/doc/task%20flow.png)

## Lending repayment

- `Builder` repays the loan by calling `repayLender(uint256 _communityID, address _project, int256 _repayAmount)` on community. It will calculate the owned interest and update the remaining debt. This will trigger the burnt of lender's debt and will transfer tokens from `builder` to `community owner`.

- If for instance an offchain repayment occurred, `community owner` can trigger `reduceDebt(uint256 _communityID, address _project, uint256 _repayAmount, bytes _details)`. It will also calculate the owned interest update the remaining debt and burn `community owner`'s debt token. Note that no token transfer between `builder` and `lender` will happen in that case.

![Builder repays Community](https://github.com/code-423n4/2022-08-rigor/blob/main/doc/builder%20repays%20community.png)

## Smart Contracts

All the contracts in this section are to be reviewed. Any contracts not in this list are to be ignored for this contest. A further breakdown of [contracts and their dependencies can be found here](https://docs.google.com/spreadsheets/d/1zrnn5i7L8PpICnjI-C7KcE_ITCVpiNnGbMLpFcT6gEU/edit#gid=0)

### Files in scope

| File                                                                                                                                                                           | nSLOC | SLOC | Lines |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---: | :--: | :---: |
| _Contracts (7)_                                                                                                                                                                |
| [contracts/DebtToken.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/DebtToken.sol)                                   |  35   |  55  |  106  |
| [contracts/ProjectFactory.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/ProjectFactory.sol)                         |  37   |  56  |  106  |
| [contracts/HomeFiProxy.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/HomeFiProxy.sol)                               |  70   |  93  |  231  |
| [contracts/Disputes.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Disputes.sol)                                     |  112  | 144  |  273  |
| [contracts/HomeFi.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/HomeFi.sol)                                         |  117  | 197  |  323  |
| [contracts/Project.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Project.sol)                                       |  406  | 474  |  911  |
| [contracts/Community.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Community.sol)                                   |  422  | 569  |  919  |
| _Libraries (2)_                                                                                                                                                                |
| [contracts/libraries/SignatureDecoder.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/libraries/SignatureDecoder.sol) |  34   |  50  |  86   |
| [contracts/libraries/Tasks.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/libraries/Tasks.sol)                       |  68   |  86  |  198  |
| Total (over 9 files):                                                                                                                                                          | 1301  | 1724 | 3153  |

### Direct parent contracts of in-scope contracts (not in scope)

| File                                                                                                                                                                           | nSLOC | SLOC | Lines |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---: | :--: | :---: |
| _Interfaces (6)_                                                                                                                                                               |
| [contracts/interfaces/IDebtToken.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/interfaces/IDebtToken.sol)           |   8   |  13  |  50   |
| [contracts/interfaces/IProjectFactory.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/interfaces/IProjectFactory.sol) |   9   |  14  |  58   |
| [contracts/interfaces/IHomeFi.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/interfaces/IHomeFi.sol)                 |  41   |  64  |  206  |
| [contracts/interfaces/IDisputes.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/interfaces/IDisputes.sol)             |  45   |  68  |  160  |
| [contracts/interfaces/IProject.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/interfaces/IProject.sol)               |  57   |  87  |  331  |
| [contracts/interfaces/ICommunity.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/interfaces/ICommunity.sol)           |  114  | 175  |  440  |
| Total (over 6 files):                                                                                                                                                          |  274  | 421  | 1245  |

### Other contracts directly imported by in-scope contracts (not in scope)

None

### All other source contracts (not in scope)

None

### HomeFiProxy.sol (93 sloc each)

- Upgradability proxy as documented by [OpenZeppelin](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies)

### HomeFi.sol (197 sloc each)

The main entry point for the HomeFi Smart Contract ecosystem. Administrative actions are executed through this contract; new project contracts are created from this contract with accompanying ERC721 for each project.

- ERC2771 compatible with [ERC2771Context from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/metatx#ERC2771Context).
- It uses [Reentrancy Guard from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/security#ReentrancyGuard).

### Project.sol (474 sloc each)

Child contract deployed from HomeFi.sol, Project.sol contains the primary logic around construction project management. Onboarding contractors, fund escrow, and completion tracking are all managed here. Significant multi-signature and meta-transaction functionality is included here.

- It uses [Reentrancy Guard from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/security#ReentrancyGuard).
- It uses [SafeERC20Upgradeable from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#SafeERC20) for all debt token transfers.
- As we are heavily using signatures as params for sensitive operations. We created a [Signature decoder library](https://github.com/code-423n4/2022-08-rigor/blob/main/contracts/libraries/SignatureDecoder.sol) that is able to recover multiple signatures compacted in a bytes format as well as recover the address who signed the message.
- Tasks are a big part of a project. We created a [task library](https://github.com/code-423n4/2022-08-rigor/blob/main/contracts/libraries/Tasks.sol) for all task related operations.
- ERC2771 compatible with [ERC2771Context from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/metatx#ERC2771Context).

### ProjectFactory.sol (56 sloc each)

Technically separate from HomeFi.sol but can only be accessed by HomeFi.sol.

- Uses [clones](https://docs.openzeppelin.com/contracts/4.x/api/proxy#Clones") to achieve the minimal use of gas when deploying new Project contracts.
- ERC2771 compatible with [ERC2771Context from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/metatx#ERC2771Context).

### Community.sol (569 sloc each)

Contains all project publication and lender funding logic. Lenders fund project contracts through Community.sol, and Builders repay lenders through Community.sol as well.

- It uses [Reentrancy Guard from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/security#ReentrancyGuard).
- It inherits [OpenZeppelin Pausable](https://docs.openzeppelin.com/contracts/4.x/api/security#Pausable) base class.
- It uses [SafeERC20Upgradeable from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#SafeERC20) for all debt token transfers.
- It uses our [Signature decoder library](/contracts/libraries/SignatureDecoder.sol).
- ERC2771 compatible with [ERC2771Context from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/metatx#ERC2771Context).

### Disputes.sol (144 sloc each)

In the event that a contractor (general or sub) does not get their funds and should have received them, or if there is negligence or malfeasance in the relationship between a builder and lender, participants permissioned in the project have the ability to raise a dispute that HomeFi's admins (in our case Rigor) are able to arbitrate to make sure funds arrive in the correct user's wallet.

- It uses [Reentrancy Guard from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/security#ReentrancyGuard).
- It uses our [Signature decoder library](https://github.com/code-423n4/2022-08-rigor/blob/main/contracts/libraries/SignatureDecoder.sol).
- ERC2771 compatible with [ERC2771Context from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/metatx#ERC2771Context).

### DebtToken.sol (55 sloc each)

Used to wrap Ether, USDC, or Dai and collateralize a given project. hTokens are given to lenders in the Community.sol contract as a receipt to track their lending into the project. On an builder's repayment of a project, hTokens are instantly destroyed, and the underlying collateral is returned + interest for the loan duration.

- It inherits [OpenZeppelin ERC20](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20) base class. Note that transfer are disabled and mint and burn are only available to the community contract.

### Tasks.sol (86 sloc each)

Internal library used in Project. Contains functions specific to a task actions and lifecycle.

### SignatureDecoder.sol (50 sloc each)

Decodes signatures that are encoded as bytes.

## External imports

- **@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol**
  - [contracts/HomeFiProxy.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/HomeFiProxy.sol)
- **@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol**
  - [contracts/Community.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Community.sol)
  - [contracts/Disputes.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Disputes.sol)
  - [contracts/HomeFi.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/HomeFi.sol)
  - [contracts/Project.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Project.sol)
  - [contracts/ProjectFactory.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/ProjectFactory.sol)
- **@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol**
  - [contracts/ProjectFactory.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/ProjectFactory.sol)
- **@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol**
  - [contracts/Community.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Community.sol)
- **@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol**
  - [contracts/Community.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Community.sol)
  - [contracts/Disputes.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Disputes.sol)
  - [contracts/HomeFi.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/HomeFi.sol)
  - [contracts/Project.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Project.sol)
- **@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol**
  - [contracts/DebtToken.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/DebtToken.sol)
- **@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol**
  - ~~[contracts/interfaces/IDebtToken.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/interfaces/IDebtToken.sol)~~
- **@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol**
  - [contracts/Community.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Community.sol)
  - [contracts/Project.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/Project.sol)
- **@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol**
  - [contracts/HomeFi.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/HomeFi.sol)
- **@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol**
  - [contracts/HomeFiProxy.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/HomeFiProxy.sol)
- **@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol**
  - [contracts/HomeFiProxy.sol](https://github.com/code-423n4/2022-08-rigor/blob/a2bc200561598f76a7adbf7f7295a8e4a3c18920/contracts/HomeFiProxy.sol)

## Interest calculation

Interest on a loan are calculated on the principal only and doesn't include interest on the accrued interest.

When a repayment occurs we first repay the interest and if their is money left the principal is repaid. Afterwards the interest will be calculated on the remaining principal.

Here is some examples on a [spreadsheet](https://docs.google.com/spreadsheets/d/13426xFRQf_akchTzD0426N5AYS6gWqLWfaPeCx1xPbk/edit#gid=971639909).

## Getting started

- Clone this repository

```bash
git clone https://github.com/code-423n4/2022-08-rigor.git
cd 2022-08-rigor
```

- Install dependencies with [yarn](https://classic.yarnpkg.com/en/)

```bash
yarn
```

- Create .env file (you can copy ".sample.env")

```bash
cp .sample.env .env
```

## Build contracts

- to compile run

`yarn compile`

## Run tests

- to run tests

`yarn test`

## Run test coverage

- to test coverage

`yarn coverage`

## Gas reports

`REPORT_GAS=true yarn test`

## Deployment Steps

- Run the following command to deploy smart contracts (for local)

`yarn deploy-local`

- Run the following command to deploy smart contracts (for rinkeby)

`yarn deploy-rinkeby`

## Upgradability

### HomeFIProxy

HomeFiProxy contract stores the proxies for **HomeFi**, **Community**, **Disputes**,
**ProjectFactory**, and all the three **DebtTokens**. These proxies' implementation can be upgraded individually. Only the `admin` can upgrade implementations.
All proxies are stored in an array inside HomeFiProxy with a bytes2 name associated to them.
|Contract Proxy|Bytes2 Name|
|---|---|
|HomeFi|`HF`|
|Community|`CN`|
|Disputes|`DP`|
|ProjectFactory|`PF`|
|Native Currency Debt Token|`DA`|
|Token Currency 1 Debt Token|`US`|
|Token Currency 2 Debt Token|`NT`|

### Steps to upgrade Proxy

> This is valid for all HomeFi proxies- HomeFi, Community, Disputes, ProjectFactory, and DeptTokens.

1. Add `virtual` modifier to all the functions of old implementation(V1) that are needed to be upgraded.
2. Make the new implementation(V2) inherit V1.
3. Rules:
   - Add new variable and functions normally
   - Use `override` modifier when overriding a V1 `function` or `modifier`
   - Cannot override or modify an `event`
4. Test the V2 contracts plus regression the V2 implementation with V1 tests. To make this process easier, paste V2 implementation in ./contract/mocks/`ContractName`V2Mock.sol and its tests inside ./test/utils/`contractName`UpgradabilityTests.ts and simply run the `Upgradability.ts` test.
5. Before upgrading on production(xDai), deploy upgrades development testnets(rinkeby) and test.
6. Deploy upgrades on production(xDai) and test.

### Upgrade Proxy Using script

1. Save the new proxy implementation according to the step above.
2. Run `yarn compile` to compile all contracts, including the new implementation.
3. Deploy the new implementation, possibly by creating a new script, and save its address.
4. In the `./scripts/upgrade.ts` file, update the following variable accordingly to your deployment:
   - `homeFiProxyAddress`: address of homeFiProxy
   - `proxyBytes2Name`: name of the proxy to upgrade. For ex: `PF` for `ProjectFactor`. Refer `./contracts/HomeFiProxy.sol` for proxies and there name.
   - `newImplementationName`: address of the underlying implementation. For ex: address of new `ProjectFactory` contract.
   - `taskLibraryAddress`: only required when upgrading `ProjectFactory` proxy. Address of `TaskLibrary` that is linked to `Project` contract.
5. Run the `upgrade` script,
   ```
   yarn hardhat run scripts/upgrade.ts --network <your preferred network>
   ```
6. The `upgrade` script will automatically run the `tests` if using the `hardhat` network.
   > Look at various tested V2 mocks inside `./contract/mocks`

### ProjectFactory and Project

ProjectFactory proxy upgrade is mostly required to upgrade the underlying `Project` contract implementation. To make this upgrade, the new implementation of `ProjectFactory` must add a function to change the `underlying` address with new `Project` implementation. Potentially also updating the interface for `Project` contract. Check `./contracts/mock/ProjectFactoryV2Mock.sol` and `contracts/mock/ProjectV2Mock.sol` for reference.

## Deployments

Latest contract addresses can be found under "deployments/\<network\>.json"

## Scoping details answers

```
- Do you have a link to the repo that the contest will cover?
https://github.com/RigorHQ/Rigor-ProtocolV2

- How many (non-library) contracts are in the scope?
7

- Total sLoC in these contracts?
2105

- How many library dependencies?
2

- How many separate interfaces and struct definitions are there for the contracts within scope?
7 interfaces 4 structs

- Does most of your code generally use composition or inheritance?
We are mostly using Inheritance for storing the basic schema of our contracts. Storing external functions params, returns, events, structs, and enums, without any implementation.

- How many external calls?
Two. Calling transfer() and transferFrom() on supported tokens. As of now, we are supporting USDC, WXDAI, and WETH.

- Is there a need to understand a separate part of the codebase / get context in order to audit this part of the protocol?
false

- Does it use an oracle?
false

- Does the token conform to the ERC20 standard?
We have a debt token that is a modified ERC20

- Are there any novel or unique curve logic or mathematical models?
No

- Does it use a timelock function?
No

- Is it an NFT?
We use NFTs

- Does it have an AMM?
No

- Is it a fork of a popular project?
false

- Does it use rollups?
false

- Is it multi-chain?
false

- Does it use a side-chain?
false
```
