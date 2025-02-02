// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./CommonToken.sol";
import "./AgentRegistry.sol";

/**
 * @title CommonResource
 * @notice Manages resources in the Agent Commons ecosystem. 
 *         For non-core resources, `creator` is whatever address is passed as `actualCreator`. 
 */
contract CommonResource is ERC1155, AccessControl, EIP712("CommonResource", "1.0") {
    CommonToken public commonToken;
    AgentRegistry public agentRegistry;

    bytes32 public constant CORE_RESOURCE_CREATOR_ROLE = keccak256("CORE_RESOURCE_CREATOR_ROLE");
    bytes32 public constant CORE_ADMIN_ROLE = keccak256("CORE_ADMIN_ROLE");

    struct Resource {
        address creator;          
        string metadata;
        string resourceFile;
        uint256 requiredReputation;
        uint256 usageCost;      
        address[] contributors;
        uint256[] contributionShares;
        bool isCoreResource;
    }

    mapping(uint256 => Resource) public resources;
    uint256 private _nextResourceId = 1;

    bytes32 public constant RESOURCE_ACCESS_TYPEHASH = keccak256(
        "ResourceAccess(address user,uint256 resourceId,uint256 timestamp)"
    );

    event ResourceCreated(uint256 indexed resourceId, address indexed creator, bool isCoreResource);
    event ResourceUsed(uint256 indexed resourceId, address indexed user, bytes accessProof);
    event ResourceCostUpdated(uint256 indexed resourceId, uint256 newCost);
    event ResourceReputationUpdated(uint256 indexed resourceId, uint256 newReputation);

    constructor(address commonTokenAddress, address agentRegistryAddress)
        ERC1155("https://api.agentcommons.io/resources/{id}.json")
    {
        commonToken = CommonToken(payable(commonTokenAddress));
        agentRegistry = AgentRegistry(agentRegistryAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(CORE_ADMIN_ROLE, msg.sender);
        _grantRole(CORE_RESOURCE_CREATOR_ROLE, msg.sender);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Create a new resource on behalf of `actualCreator`.
     * @param actualCreator The address that will be set as the resource creator if non-core.
     * @param isCoreResource If true => `actualCreator` is ignored & we set `creator=address(0)`.
     */
    function createResource(
        address actualCreator,
        string memory metadata,
        string memory resourceFile,
        uint256 requiredReputation,
        uint256 usageCost,
        address[] memory contributors,
        uint256[] memory shares,
        bool isCoreResource
    ) external returns (uint256) {
        if (isCoreResource) {
            require(hasRole(CORE_RESOURCE_CREATOR_ROLE, msg.sender), "Not authorized to create default resources");
        } else {
            // Non-core => ensure the actualCreator is a registered agent
            require(agentRegistry.registeredAgents(actualCreator), "Not a registered agent");
            require(contributors.length == shares.length, "Contributors and shares mismatch");
        }

        uint256 resourceId = _nextResourceId++;
        
        if (isCoreResource) {
            // core => creator=address(0)
            resources[resourceId] = Resource({
                creator: address(0),
                metadata: metadata,
                resourceFile: resourceFile,
                requiredReputation: requiredReputation,
                usageCost: usageCost,
                contributors: new address[](0),
                contributionShares: new uint256[](0),
                isCoreResource: true
            });
        } else {
            // For a non-core resource, we mint shares to the given contributors
            uint256 totalShares;
            for (uint256 i = 0; i < shares.length; i++) {
                totalShares += shares[i];
            }
            for (uint256 i = 0; i < contributors.length; i++) {
                _mint(contributors[i], resourceId, shares[i], "");
            }

            resources[resourceId] = Resource({
                creator: actualCreator,
                metadata: metadata,
                resourceFile: resourceFile,
                requiredReputation: requiredReputation,
                usageCost: usageCost,
                contributors: contributors,
                contributionShares: shares,
                isCoreResource: false
            });
        }

        emit ResourceCreated(resourceId, isCoreResource ? msg.sender : actualCreator, isCoreResource);
        return resourceId;
    }

    /**
     * @dev Use a resource, paying `usageCost`. 
     *      leftover => user rep
     */
    function useResource(uint256 resourceId, uint256 contribution) external {
        Resource storage resource = resources[resourceId];
        require(resource.isCoreResource || resource.creator != address(0), "Resource doesn't exist");

        ( , , uint256 userReputation, , ) = agentRegistry.agents(msg.sender);
        require(userReputation >= resource.requiredReputation, "Insufficient reputation");

        require(contribution >= resource.usageCost, "Insufficient usage cost provided");

        // Transfer from user => contract
        commonToken.transferFrom(msg.sender, address(this), contribution);

        // burn or distribute usageCost
        if (resource.isCoreResource) {
            commonToken.burn(address(this), resource.usageCost);
        } else {
            uint256 totalShares;
            for (uint256 i = 0; i < resource.contributionShares.length; i++) {
                totalShares += resource.contributionShares[i];
            }
            for (uint256 i = 0; i < resource.contributors.length; i++) {
                uint256 shareAmount = (resource.contributionShares[i] * resource.usageCost) / totalShares;
                commonToken.transfer(resource.contributors[i], shareAmount);
            }
        }

        // leftover => user rep
        uint256 leftover = contribution - resource.usageCost;
        if (leftover > 0) {
            agentRegistry.updateReputation(msg.sender, leftover);
        }

        // EIP-712 style event
        uint256 timestamp = block.timestamp;
        bytes32 structHash = keccak256(abi.encode(
            RESOURCE_ACCESS_TYPEHASH,
            msg.sender,
            resourceId,
            timestamp
        ));
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash)
        );
        bytes memory accessProof = abi.encodePacked(ethSignedMessageHash);

        emit ResourceUsed(resourceId, msg.sender, accessProof);
    }

    function updateResourceCost(uint256 resourceId, uint256 newCost) external {
        Resource storage resource = resources[resourceId];
        require(
            resource.isCoreResource
                ? hasRole(CORE_ADMIN_ROLE, msg.sender)
                : (resource.creator == msg.sender || hasRole(CORE_ADMIN_ROLE, msg.sender)),
            "Not authorized to update cost"
        );
        resource.usageCost = newCost;
        emit ResourceCostUpdated(resourceId, newCost);
    }

    function updateResourceReputationRequirement(uint256 resourceId, uint256 newReputation) external {
        Resource storage resource = resources[resourceId];
        require(
            resource.isCoreResource
                ? hasRole(CORE_ADMIN_ROLE, msg.sender)
                : (resource.creator == msg.sender || hasRole(CORE_ADMIN_ROLE, msg.sender)),
            "Not authorized to update reputation requirement"
        );
        resource.requiredReputation = newReputation;
        emit ResourceReputationUpdated(resourceId, newReputation);
    }
}
