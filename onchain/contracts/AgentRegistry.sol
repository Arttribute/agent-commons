// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AgentRegistry
 * @notice Manages registered agents in the Agent Commons ecosystem.
 */
contract AgentRegistry is AccessControl {
    struct Agent {
        address owner;
        string metadata;
        uint256 reputation;   // Stored in Wei or raw integer
        bool isCommonAgent;
        uint256 registrationTime;
    }

    mapping(address => Agent) public agents;
    mapping(address => bool) public registeredAgents;

    bytes32 public constant REPUTATION_MANAGER_ROLE = keccak256("REPUTATION_MANAGER_ROLE");

    event AgentRegistered(address indexed agentAddress, bool isCommonAgent);
    event ReputationUpdated(address indexed agentAddress, uint256 newReputation);

    constructor() {
        // Deploying address is the default admin
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Register a new agent with optional `isCommonAgent`.
     */
    function registerAgent(
        address agentAddress,
        string memory metadata,
        bool isCommonAgent
    ) external {
        require(!registeredAgents[agentAddress], "Agent already registered");

        agents[agentAddress] = Agent({
            owner: msg.sender,
            metadata: metadata,
            reputation: 0,
            isCommonAgent: isCommonAgent,
            registrationTime: block.timestamp
        });
        registeredAgents[agentAddress] = true;

        emit AgentRegistered(agentAddress, isCommonAgent);
    }

    /**
     * @dev Update the reputation of a registered agent by `reputationChange`.
     *      Interpreted as a signed integer in two's complement form if negative.
     */
    function updateReputation(address agentAddress, uint256 reputationChange)
        external
        onlyRole(REPUTATION_MANAGER_ROLE)
    {
        require(registeredAgents[agentAddress], "Agent not registered");

        if (reputationChange > 0) {
            // Positive => Increase
            agents[agentAddress].reputation += reputationChange;
        } else {
            // Negative => Decrease
            uint256 decrease = uint256(-int256(reputationChange));
            if (decrease > agents[agentAddress].reputation) {
                agents[agentAddress].reputation = 0;
            } else {
                agents[agentAddress].reputation -= decrease;
            }
        }

        emit ReputationUpdated(agentAddress, agents[agentAddress].reputation);
    }
}
