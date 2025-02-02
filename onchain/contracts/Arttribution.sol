// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./CommonResource.sol";
import "./AgentRegistry.sol";

contract Attribution is AccessControl {
    enum RelationType {
        DERIVED_FROM,
        INSPIRED_BY,
        USES,
        COLLABORATED_WITH
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

    mapping(uint256 => AttributionRecord) public attributions;
    mapping(uint256 => Citation[]) public citations;
    mapping(uint256 => uint256[]) public derivatives;

    uint256 public constant ATTRIBUTION_REPUTATION_REWARD = 1e18; // If you want 1 "unit" = 1e18

    event AttributionRecorded(
        uint256 indexed resourceId,
        uint256[] parentResources,
        RelationType[] relationTypes
    );

    constructor(address commonsResourceAddress, address agentRegistryAddress) {
        commonResource = CommonResource(commonsResourceAddress);
        agentRegistry = AgentRegistry(agentRegistryAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

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
        require(msg.sender == resourceOwner, "Only resource creator can record attribution");

        AttributionRecord storage record = attributions[resourceId];
        record.resourceId = resourceId;
        record.parentResources = parentResources;
        record.relationTypes = relationTypes;
        record.contributionDescriptions = descriptions;
        record.timestamp = block.timestamp;

        for (uint256 i = 0; i < parentResources.length; i++) {
            derivatives[parentResources[i]].push(resourceId);

            citations[resourceId].push(Citation({
                citingResourceId: resourceId,
                citedResourceId: parentResources[i],
                description: descriptions[i],
                timestamp: block.timestamp
            }));
        }

        // Each parent => +1e18 rep
        if (parentResources.length > 0) {
            agentRegistry.updateReputation(
                msg.sender,
                ATTRIBUTION_REPUTATION_REWARD * parentResources.length
            );
        }

        emit AttributionRecorded(resourceId, parentResources, relationTypes);
    }

    function getDerivatives(uint256 resourceId) external view returns (uint256[] memory) {
        return derivatives[resourceId];
    }

    function getCitations(uint256 resourceId) external view returns (Citation[] memory) {
        return citations[resourceId];
    }

    function getAttributionChain(uint256 resourceId)
        external
        view
        returns (
            uint256[] memory parentIds,
            RelationType[] memory relationTypesArr,
            string[] memory descriptions
        )
    {
        AttributionRecord storage record = attributions[resourceId];
        return (
            record.parentResources,
            record.relationTypes,
            record.contributionDescriptions
        );
    }
}
