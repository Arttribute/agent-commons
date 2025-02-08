// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./CommonToken.sol";
import "./AgentRegistry.sol";
import "./CommonResource.sol";

/**
 * @title TaskManager
 * @dev Allows creation of tasks, joining tasks, recording contributions,
 *      distributing rewards, or creating resources in the commons.
 */
contract TaskManager is ReentrancyGuard, AccessControl {
    CommonToken public commonToken;
    AgentRegistry public agentRegistry;
    CommonResource public commonResource;

    struct Contribution {
        address contributor;
        uint256 value;
    }

    enum TaskStatus { open, completed }

    struct Task {
        address creator;
        string metadata;
        string description;
        uint256 reward;
        bool resourceBased;
        TaskStatus status;
        Contribution[] contributions;
        bool rewardsDistributed;
        uint256[] subtasks;
        uint256 parentTaskId;
        uint256 maxParticipants;
        uint256 currentParticipants;
    }

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

    function getTask(uint256 taskId)
        external
        view
        returns (
            address creator,
            string memory metadata,
            string memory description,
            uint256 reward,
            bool resourceBased,
            TaskStatus status,
            bool rewardsDistributed,
            uint256 parentTaskId,
            uint256 maxParticipants,
            uint256 currentParticipants,
            uint256[] memory subtasks
        )
    {
        Task storage t = tasks[taskId];
        return (
            t.creator,
            t.metadata,
            t.description,
            t.reward,
            t.resourceBased,
            t.status,
            t.rewardsDistributed,
            t.parentTaskId,
            t.maxParticipants,
            t.currentParticipants,
            t.subtasks
        );
    }

    function createTask(
        string memory metadata,
        string memory description,
        uint256 reward,
        bool resourceBased,
        uint256 parentTaskId,
        uint256 maxParticipants
    ) external returns (uint256) {
        require(agentRegistry.registeredAgents(msg.sender), "Not a registered agent");

        if (!resourceBased) {
            bool ok = commonToken.transferFrom(msg.sender, address(this), reward);
            require(ok, "Reward transfer failed");
        }

        uint256 taskId = _nextTaskId++;
        Task storage newTask = tasks[taskId];

        newTask.creator = msg.sender;
        newTask.metadata = metadata;
        newTask.description = description;
        newTask.reward = reward;
        newTask.resourceBased = resourceBased;
        newTask.status = TaskStatus.open;
        newTask.rewardsDistributed = false;
        newTask.parentTaskId = parentTaskId;
        newTask.maxParticipants = maxParticipants;
        newTask.currentParticipants = 0;

        if (parentTaskId != 0) {
            require(tasks[parentTaskId].creator != address(0), "Parent task does not exist");
            tasks[parentTaskId].subtasks.push(taskId);
        }

        emit CreatedTask(taskId, msg.sender, parentTaskId);
        return taskId;
    }

    function joinTask(uint256 taskId) external {
        require(agentRegistry.registeredAgents(msg.sender), "Not a registered agent");
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.open, "Task is not open");
        require(task.currentParticipants < task.maxParticipants, "Max participants reached");
        require(!joinedTask[taskId][msg.sender], "Already joined this task");

        joinedTask[taskId][msg.sender] = true;
        task.currentParticipants++;

        emit JoinedTask(taskId, msg.sender);
    }

    function recordContribution(
        uint256 taskId,
        address contributor,
        uint256 value
    ) external {
        Task storage task = tasks[taskId];
        require(msg.sender == task.creator, "Only creator can add contributions");
        require(task.status == TaskStatus.open, "Task not in Open state");
        require(agentRegistry.registeredAgents(contributor), "Not a registered agent");
        require(value > 0, "Contribution value must be greater than zero");
        require(joinedTask[taskId][contributor], "Must join task before contributing");

        task.contributions.push(Contribution({ contributor: contributor, value: value }));
        emit RecordedContribution(taskId, contributor, value);
    }

    function completeTask(uint256 taskId, string memory resultantFile) external nonReentrant {
        Task storage task = tasks[taskId];
        require(msg.sender == task.creator, "Only creator can complete task");
        require(task.status == TaskStatus.open, "Task not in Open state");

        // All subtasks must be completed
        for (uint256 i = 0; i < task.subtasks.length; i++) {
            require(tasks[task.subtasks[i]].status == TaskStatus.completed, "All subtasks must be completed");
        }

        _handleTaskCompletion(taskId, resultantFile);

        task.status = TaskStatus.completed;
        emit CompletedTask(taskId);
    }

    function _handleTaskCompletion(uint256 taskId, string memory resultantFile) internal {
        Task storage task = tasks[taskId];

        if (task.resourceBased) {
            // Build arrays for resource creation
            address[] memory contributors = new address[](task.contributions.length);
            uint256[] memory shares = new uint256[](task.contributions.length);

            for (uint256 i = 0; i < task.contributions.length; i++) {
                contributors[i] = task.contributions[i].contributor;
                shares[i] = task.contributions[i].value;
            }

            // Now pass `task.creator` as the actual creator.
            // So the final resource in CommonResource has .creator = agent
            commonResource.createResource(
                task.creator,
                task.metadata,
                resultantFile,
                0,
                task.reward,
                contributors,
                shares,
                false
            );
        } else {
            _distributeRewards(taskId);
        }
    }

    function _distributeRewards(uint256 taskId) internal {
        Task storage task = tasks[taskId];
        require(!task.rewardsDistributed, "Rewards already distributed");

        uint256 totalValue = _calculateTotalContributions(task.contributions);
        for (uint256 i = 0; i < task.contributions.length; i++) {
            Contribution storage c = task.contributions[i];
            uint256 participantReward = (task.reward * c.value) / totalValue;
            commonToken.transfer(c.contributor, participantReward);
        }

        task.rewardsDistributed = true;
        emit TaskRewardsDistributed(taskId);
    }

    function _calculateTotalContributions(Contribution[] storage array)
        internal
        view
        returns (uint256)
    {
        uint256 total;
        for (uint256 i = 0; i < array.length; i++) {
            total += array[i].value;
        }
        return total;
    }
}
