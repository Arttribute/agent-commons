// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./CommonResource.sol";
import "./AgentRegistry.sol";

/**
 * @title Attribution
 * @dev Manages attribution and relationships between resources in the Agent Commons
 */
contract Attribution is AccessControl {

    enum RelationType { 
        DERIVED_FROM,      // Resource is derived from another resource
        INSPIRED_BY,       // Resource uses another resource as inspiration
        USES,             // Resource uses another resource as a component
        COLLABORATED_WITH  // Resources were created in collaboration
    }

    struct AttributionRecord {
        uint256 resourceId;
        uint256[] parentResources;
        RelationType[] relationTypes;
        string[] contributionDescriptions;
        uint256 timestamp;
    }

    struct Citation {
        uint256 citingResourceId;
        uint256 citedResourceId;
        string description;
        uint256 timestamp;
    }

    CommonResource public commonResource;
    AgentRegistry public agentRegistry;
    
    // Resource ID => Attribution Record
    mapping(uint256 => AttributionRecord) public attributions;
    
    // Resource ID => Array of Citations
    mapping(uint256 => Citation[]) public citations;
    
    // Resource ID => Array of derivative works
    mapping(uint256 => uint256[]) public derivatives;

    // Reputation rewards for attribution
    uint256 public constant ATTRIBUTION_REPUTATION_REWARD = 1;

    event AttributionRecorded(
        uint256 indexed resourceId,
        uint256[] parentResources,
        RelationType[] relationTypes
    );

    event CitationAdded(
        uint256 indexed citingResourceId,
        uint256 indexed citedResourceId,
        string description
    );

    constructor(address commonsResourceAddress, address agentRegistryAddress) {
        commonResource = CommonResource(commonsResourceAddress);
        agentRegistry = AgentRegistry(agentRegistryAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Records attribution for a new resource
     * @param resourceId ID of the new resource
     * @param parentResources Array of resource IDs that contributed to this resource
     * @param relationTypes Array of relationship types corresponding to parent resources
     * @param descriptions Array of descriptions explaining each contribution
     */
    function recordAttribution(
        uint256 resourceId,
        uint256[] memory parentResources,
        RelationType[] memory relationTypes,
        string[] memory descriptions
    ) external {
        require(
            parentResources.length == relationTypes.length &&
            relationTypes.length == descriptions.length,
            "Arrays length mismatch"
        );
        
        (address resourceOwner, , , , , ) = commonResource.resources(resourceId);
        require(
            msg.sender == resourceOwner,
            "Only resource creator can record attribution"
        );

        AttributionRecord storage record = attributions[resourceId];
        record.resourceId = resourceId;
        record.parentResources = parentResources;
        record.relationTypes = relationTypes;
        record.contributionDescriptions = descriptions;
        record.timestamp = block.timestamp;

        // Record derivative relationships and citations
        for (uint256 i = 0; i < parentResources.length; i++) {
            derivatives[parentResources[i]].push(resourceId);
            
            citations[resourceId].push(Citation({
                citingResourceId: resourceId,
                citedResourceId: parentResources[i],
                description: descriptions[i],
                timestamp: block.timestamp
            }));
        }

        // Reward attribution with reputation
        if (parentResources.length > 0) {
            agentRegistry.updateReputation(
                msg.sender, 
                ATTRIBUTION_REPUTATION_REWARD * parentResources.length
            );
        }

        emit AttributionRecorded(resourceId, parentResources, relationTypes);
    }

    /**
     * @dev Gets all derivative works of a resource
     * @param resourceId ID of the resource
     * @return Array of resource IDs that are derived from the given resource
     */
    function getDerivatives(uint256 resourceId) external view returns (uint256[] memory) {
        return derivatives[resourceId];
    }

    /**
     * @dev Gets all citations of a resource
     * @param resourceId ID of the resource
     * @return Array of Citations citing the given resource
     */
    function getCitations(uint256 resourceId) external view returns (Citation[] memory) {
        return citations[resourceId];
    }

    /**
     * @dev Gets the complete attribution chain for a resource
     * @param resourceId ID of the resource
     * @return parentIds Array of all parent resource IDs in the attribution chain
     * @return relationTypes Array of relation types corresponding to parent resources
     * @return descriptions Array of contribution descriptions
     */
    function getAttributionChain(uint256 resourceId) external view returns (
        uint256[] memory parentIds,
        RelationType[] memory relationTypes,
        string[] memory descriptions
    ) {
        AttributionRecord storage record = attributions[resourceId];
        return (
            record.parentResources,
            record.relationTypes,
            record.contributionDescriptions
        );
    }
}