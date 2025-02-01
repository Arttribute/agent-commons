// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./CommonToken.sol"; 
import "./AgentRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

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
        uint256 usageCost; // in COMMON$
        address[] contributors;
        uint256[] contributionShares;
        bool isCoreResource;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    mapping(uint256 => Resource) public resources;
    uint256 private _nextResourceId = 1;
    bytes32 public constant RESOURCE_ACCESS_TYPEHASH = keccak256("ResourceAccess(address user,uint256 resourceId,uint256 timestamp)");

    event ResourceCreated(uint256 indexed resourceId, address indexed creator, bool isCoreResource);
    event ResourceUsed(uint256 indexed resourceId, address indexed user, bytes accessProof);
    event ResourceCostUpdated(uint256 indexed resourceId, uint256 newCost);
    event ResourceReputationUpdated(uint256 indexed resourceId, uint256 newReputation);

    constructor(
        address commonTokenAddress,
        address agentRegistryAddress
    ) ERC1155("https://api.agentcommons.io/resources/{id}.json") {
        commonToken = CommonToken(payable(commonTokenAddress));
        agentRegistry = AgentRegistry(agentRegistryAddress);

        _grantRole(CORE_ADMIN_ROLE, msg.sender);
        _grantRole(CORE_RESOURCE_CREATOR_ROLE, msg.sender); // Assign default resource creation rights to admin
    }

    function createResource(
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
            require(contributors.length == shares.length, "Contributors and shares mismatch");
            require(agentRegistry.registeredAgents(msg.sender), "Not a registered agent");
        }

        uint256 resourceId = _nextResourceId++;

        resources[resourceId] = Resource({
            creator: isCoreResource ? address(0) : msg.sender,
            metadata: metadata,
            resourceFile: resourceFile,
            requiredReputation: requiredReputation,
            usageCost: usageCost,
            contributors: contributors,
            contributionShares: shares,
            isCoreResource: isCoreResource
        });

        if (!isCoreResource) {
            uint256 totalShares = 0;
            for (uint256 i = 0; i < shares.length; i++) {
                totalShares += shares[i];
            }

            for (uint256 i = 0; i < contributors.length; i++) {
                _mint(contributors[i], resourceId, shares[i], "");
            }
        }

        emit ResourceCreated(resourceId, msg.sender, isCoreResource);
        return resourceId;
    }

    function useResource(uint256 resourceId, uint256 contribution) external {
        Resource storage resource = resources[resourceId];
        require(resource.creator != address(0) || resource.isCoreResource, "Resource doesn't exist");

        uint256 reputation;
        (, , reputation, , ) = agentRegistry.agents(msg.sender);
        require(reputation >= resource.requiredReputation, "Insufficient reputation");

        uint256 contributionAmount = contribution;
        require(contributionAmount >= resource.usageCost, "Insufficient usage cost provided");

        if (resource.isCoreResource) {
            commonToken.burn(msg.sender, resource.usageCost);
        } else {
            uint256 totalShares = 0;
            for (uint256 i = 0; i < resource.contributionShares.length; i++) {
                totalShares += resource.contributionShares[i];
            }

            for (uint256 i = 0; i < resource.contributors.length; i++) {
                uint256 contributorShare = (contributionAmount * resource.contributionShares[i]) / totalShares;
                commonToken.transfer(resource.contributors[i], contributorShare);
            }
        }

        uint256 extraContribution = 0;
        if (resource.usageCost > 0) {
            extraContribution = contributionAmount - resource.usageCost;
        } else {
            extraContribution = contributionAmount;
        }

        if (extraContribution > 0) {
            agentRegistry.updateReputation(msg.sender, extraContribution);
        }

        uint256 timestamp = block.timestamp;
        bytes32 structHash = keccak256(
            abi.encode(
                RESOURCE_ACCESS_TYPEHASH,
                msg.sender,
                resourceId,
                timestamp
            )
        );
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
        bytes memory accessProof = abi.encodePacked(ethSignedMessageHash);

        emit ResourceUsed(resourceId, msg.sender, accessProof);
    }

  
    function updateResourceCost(uint256 resourceId, uint256 newCost) external {
        Resource storage resource = resources[resourceId];
        require(resource.creator == msg.sender || hasRole(CORE_ADMIN_ROLE, msg.sender), "Not authorized to update cost");
        
        resource.usageCost = newCost;

        emit ResourceCostUpdated(resourceId, newCost);
    }

    
    function updateResourceReputationRequirement(uint256 resourceId, uint256 newReputation) external {
        Resource storage resource = resources[resourceId];
        require(resource.creator == msg.sender || hasRole(CORE_ADMIN_ROLE, msg.sender), "Not authorized to update reputation requirement");
        
        resource.requiredReputation = newReputation;

        emit ResourceReputationUpdated(resourceId, newReputation);
    }
}
