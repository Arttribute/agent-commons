import {
  TaskManager as TaskManagerContract,
  CompletedTask as CompletedTaskEvent,
  CreatedTask as CreatedTaskEvent,
  JoinedTask as JoinedTaskEvent,
  RecordedContribution as RecordedContributionEvent,
  RoleAdminChanged as RoleAdminChangedEvent,
  RoleGranted as RoleGrantedEvent,
  RoleRevoked as RoleRevokedEvent,
  TaskRewardsDistributed as TaskRewardsDistributedEvent,
} from "../generated/TaskManager/TaskManager";
import {
  Task,
  TaskContribution,
  RoleAdminChanged,
  RoleGranted,
  RoleRevoked,
} from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

export function handleCreatedTask(event: CreatedTaskEvent): void {
  let id = event.params.taskId.toString();
  let task = new Task(id);

  // Bind to the TaskManager contract to get full task details.
  let contract = TaskManagerContract.bind(event.address);
  let taskData = contract.getTask(event.params.taskId);

  // Assume getTask returns a tuple with fields:
  // (creator, metadata, reward, resourceBased, status, rewardsDistributed, parentTaskId, maxParticipants, currentParticipants, subtasks)
  task.taskId = event.params.taskId;
  task.creator = taskData.value0;
  task.metadata = taskData.value1;
  task.reward = taskData.value2;
  task.resourceBased = taskData.value3;
  // Convert numeric enum to string.
  if (BigInt.fromI32(taskData.value4) == BigInt.fromI32(0)) {
    task.status = "Open";
  } else {
    task.status = "Completed";
  }
  task.rewardsDistributed = taskData.value5;
  task.parentTaskId = taskData.value6;
  task.maxParticipants = taskData.value7;
  task.currentParticipants = taskData.value8;
  task.subtasks = taskData.value9; // assuming this is an array of BigInt
  task.save();

  // If there is a parent task, update its subtasks array.
  if (task.parentTaskId != BigInt.fromI32(0)) {
    let parentTask = Task.load(task.parentTaskId.toString());
    if (parentTask != null) {
      let subs = parentTask.subtasks;
      subs.push(task.taskId);
      parentTask.subtasks = subs;
      parentTask.save();
    }
  }
}

export function handleJoinedTask(event: JoinedTaskEvent): void {
  let id = event.params.taskId.toString();
  let task = Task.load(id);
  if (task != null) {
    task.currentParticipants = task.currentParticipants.plus(BigInt.fromI32(1));
    task.save();
  }
}

export function handleRecordedContribution(
  event: RecordedContributionEvent
): void {
  let taskId = event.params.taskId.toString();
  // Create a new TaskContribution entity with a unique id.
  let contributionId =
    event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let contribution = new TaskContribution(contributionId);
  contribution.task = taskId;
  contribution.contributor = event.params.contributor;
  contribution.value = event.params.value;
  contribution.save();
}

export function handleCompletedTask(event: CompletedTaskEvent): void {
  let id = event.params.taskId.toString();
  let task = Task.load(id);
  if (task != null) {
    task.status = "Completed";
    task.save();
  }
}

export function handleTaskRewardsDistributed(
  event: TaskRewardsDistributedEvent
): void {
  let id = event.params.taskId.toString();
  let task = Task.load(id);
  if (task != null) {
    task.rewardsDistributed = true;
    task.save();
  }
}

export function handleRoleAdminChanged(event: RoleAdminChangedEvent): void {
  let entity = new RoleAdminChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.role = event.params.role;
  entity.previousAdminRole = event.params.previousAdminRole;
  entity.newAdminRole = event.params.newAdminRole;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleRoleGranted(event: RoleGrantedEvent): void {
  let entity = new RoleGranted(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.role = event.params.role;
  entity.account = event.params.account;
  entity.sender = event.params.sender;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
export function handleRoleRevoked(event: RoleRevokedEvent): void {
  let entity = new RoleRevoked(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.role = event.params.role;
  entity.account = event.params.account;
  entity.sender = event.params.sender;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
