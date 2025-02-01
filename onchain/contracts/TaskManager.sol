// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CommonToken.sol"; // Add this line to import CommonToken
import "./AgentRegistry.sol"; // Add this line to import AgentRegistry
import "./CommonResource.sol"; // Add this line to import CommonsResource

contract TaskManagerWithSubtasks is ReentrancyGuard, AccessControl {
    CommonToken public commonToken;
    AgentRegistry public agentRegistry;
    CommonResource public commonResource;

    struct Contribution {
        address contributor;
        uint256 value;
    }

    struct Task {
        address creator;
        string metadata;
        uint256 reward;
        bool resourceBased;
        TaskStatus status;
        Contribution[] contributions;
        bool rewardsDistributed;
        uint256[] subtasks; // List of subtask IDs
        uint256 parentTaskId; // Parent task ID, 0 if none
        uint256 maxParticipants;      
        uint256 currentParticipants;  
    }

    enum TaskStatus { Open, Completed }

    mapping(uint256 => Task) public tasks;
    mapping(uint256 => mapping(address => bool)) public joinedTask;
    uint256 private _nextTaskId = 1;

    event CreatedTask(uint256 indexed taskId, address indexed creator, uint256 parentTaskId);
    event JoinedTask(uint256 indexed taskId, address indexed agent);
    event RecordedContribution(uint256 indexed taskId, address indexed contributor, uint256 value);
    event CompletedTask(uint256 indexed taskId);
    event TaskRewardsDistributed(uint256 indexed taskId);

    constructor(
        address commonTokenAddress,
        address agentRegistryAddress,
        address commonsResourceAddress
    ) {
        commonToken = CommonToken(payable(commonTokenAddress));
        agentRegistry = AgentRegistry(agentRegistryAddress);
        commonResource = CommonResource(commonsResourceAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Creates a new task or subtask.
     * @param metadata Metadata describing the task.
     * @param reward The total reward for the task.
     * @param resourceBased Indicates if the task is resource-based.
     * @param parentTaskId The ID of the parent task, 0 if none.
     * @param maxParticipants The maximum number of participants allowed.
     * @return taskId The ID of the created task.
     */
    function createTask(
        string memory metadata,
        uint256 reward,
        bool resourceBased,
        uint256 parentTaskId,
        uint256 maxParticipants
    ) external returns (uint256) {
        require(agentRegistry.registeredAgents(msg.sender), "Not a registered agent");

        if (!resourceBased) {
            require(
                commonToken.transferFrom(msg.sender, address(this), reward),
                "Reward transfer failed"
            );
        }

        uint256 taskId = _nextTaskId++;
        tasks[taskId] = Task({
            creator: msg.sender,
            metadata: metadata,
            reward: reward,
            resourceBased: resourceBased,
            status: TaskStatus.Open,
            contributions: new Contribution[](0),
            rewardsDistributed: false,
            subtasks: new uint256[](0),
            parentTaskId: parentTaskId,
            maxParticipants: maxParticipants,
            currentParticipants:0
        });

        if (parentTaskId != 0) {
            require(tasks[parentTaskId].creator != address(0), "Parent task does not exist");
            tasks[parentTaskId].subtasks.push(taskId);
        }

        emit CreatedTask(taskId, msg.sender, parentTaskId);
        return taskId;
    }


    /**
     * @dev Join a task to become a participant. Enforces a max-participant limit.
     *      Must join before calling recordContribution.
     */
    function joinTask(uint256 taskId) external {
        require(agentRegistry.registeredAgents(msg.sender), "Not a registered agent");

        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.Open, "Task is not open");
        require(task.currentParticipants < task.maxParticipants, "Max participants reached");
        require(!joinedTask[taskId][msg.sender], "Already joined this task");

        // Mark that this address has joined
        joinedTask[taskId][msg.sender] = true;
        task.currentParticipants += 1;

        emit JoinedTask(taskId, msg.sender);
    }

    /**
     * @dev Adds a contribution to a task.
     * @param taskId The ID of the task.
     * @param contributor The address of the contributor.
     * @param value The value of the contribution.
     */
    function recordContribution(
        uint256 taskId,
        address contributor,
        uint256 value
    ) external {
        Task storage task = tasks[taskId];
        require(msg.sender == task.creator, "Only creator can add contributions");
        require(task.status == TaskStatus.Open, "Task not in Open state");
        require(agentRegistry.registeredAgents(contributor), "Not a registered agent");
        require(value > 0, "Contribution value must be greater than zero");
        require(joinedTask[taskId][contributor], "Must join task before contributing");
        
        task.contributions.push(Contribution({
            contributor: contributor,
            value: value
        }));
        
        emit RecordedContribution(taskId, contributor, value);
    }

    function completeTask(uint256 taskId, string memory resultantFile) external nonReentrant {
        Task storage task = tasks[taskId];
        require(msg.sender == task.creator, "Only creator can complete task");
        require(task.status == TaskStatus.Open, "Task not in Open state");

        // Ensure all subtasks are completed
        for (uint256 i = 0; i < task.subtasks.length; i++) {
            require(tasks[task.subtasks[i]].status == TaskStatus.Completed, "All subtasks must be completed");
        }

        // Handle contributions and rewards
        _handleTaskCompletion(taskId, resultantFile);

        task.status = TaskStatus.Completed;
        emit CompletedTask(taskId);
    }

    /**
     * @dev Handles the completion of a task, distributing rewards or creating a resource.
     */
    function _handleTaskCompletion(uint256 taskId, string memory resultantFile) internal {
        Task storage task = tasks[taskId];
    
        if (task.resourceBased) {
    
            address[] memory contributors = new address[](task.contributions.length);
            uint256[] memory shares = new uint256[](task.contributions.length);
    
            for (uint256 i = 0; i < task.contributions.length; i++) {
                contributors[i] = task.contributions[i].contributor;
                shares[i] = task.contributions[i].value;
            }
    
            commonResource.createResource(
                task.metadata,
                resultantFile,
                0, // No reputation requirement
                task.reward, // Usage cost
                contributors,
                shares,
                false // Not a core resource
            );
        } else {
            _distributeRewards(taskId);
        }
    }

    /**
     * @dev Distributes rewards among contributors based on their contributions.
     */
    function _distributeRewards(uint256 taskId) internal {
        Task storage task = tasks[taskId];
        uint256 totalValue = _calculateTotalContributions(task.contributions);

        for (uint256 i = 0; i < task.contributions.length; i++) {
            uint256 participantReward = (task.reward * task.contributions[i].value) / totalValue;
            require(
                commonToken.transfer(task.contributions[i].contributor, participantReward),
                "Reward transfer failed"
            );
        }

        task.rewardsDistributed = true;
        emit TaskRewardsDistributed(taskId);
    }

    /**
     * @dev Calculates the total value of contributions for a task.
     */
    function _calculateTotalContributions(Contribution[] memory contributions) internal pure returns (uint256) {
        uint256 totalValue = 0;
        for (uint256 i = 0; i < contributions.length; i++) {
            totalValue += contributions[i].value;
        }
        return totalValue;
    }
}
