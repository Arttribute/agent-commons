// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract AgentRegistry is AccessControl {
    struct Agent {
        address owner;
        string metadata;
        uint256 reputation;
        bool isCommonAgent;
        uint256 registrationTime;//reconsider
    }
    
    mapping(address => Agent) public agents;
    mapping(address => bool) public registeredAgents;
    
    bytes32 public constant REPUTATION_MANAGER_ROLE = keccak256("REPUTATION_MANAGER_ROLE");
    
    event AgentRegistered(address indexed agentAddress, bool isCommonAgent);
    event ReputationUpdated(address indexed agentAddress, uint256 newReputation);
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
    
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
    
    function updateReputation(address agentAddress, uint256 reputationChange) 
        external 
        onlyRole(REPUTATION_MANAGER_ROLE) 
    {
        require(registeredAgents[agentAddress], "Agent not registered");
        
        if (reputationChange > 0) {
            agents[agentAddress].reputation += reputationChange;
        } else {
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