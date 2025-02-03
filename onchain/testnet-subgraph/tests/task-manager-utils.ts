import { newMockEvent } from "matchstick-as"
import { ethereum, BigInt, Address, Bytes } from "@graphprotocol/graph-ts"
import {
  CompletedTask,
  CreatedTask,
  JoinedTask,
  RecordedContribution,
  RoleAdminChanged,
  RoleGranted,
  RoleRevoked,
  TaskRewardsDistributed
} from "../generated/TaskManager/TaskManager"

export function createCompletedTaskEvent(taskId: BigInt): CompletedTask {
  let completedTaskEvent = changetype<CompletedTask>(newMockEvent())

  completedTaskEvent.parameters = new Array()

  completedTaskEvent.parameters.push(
    new ethereum.EventParam("taskId", ethereum.Value.fromUnsignedBigInt(taskId))
  )

  return completedTaskEvent
}

export function createCreatedTaskEvent(
  taskId: BigInt,
  creator: Address,
  parentTaskId: BigInt
): CreatedTask {
  let createdTaskEvent = changetype<CreatedTask>(newMockEvent())

  createdTaskEvent.parameters = new Array()

  createdTaskEvent.parameters.push(
    new ethereum.EventParam("taskId", ethereum.Value.fromUnsignedBigInt(taskId))
  )
  createdTaskEvent.parameters.push(
    new ethereum.EventParam("creator", ethereum.Value.fromAddress(creator))
  )
  createdTaskEvent.parameters.push(
    new ethereum.EventParam(
      "parentTaskId",
      ethereum.Value.fromUnsignedBigInt(parentTaskId)
    )
  )

  return createdTaskEvent
}

export function createJoinedTaskEvent(
  taskId: BigInt,
  agent: Address
): JoinedTask {
  let joinedTaskEvent = changetype<JoinedTask>(newMockEvent())

  joinedTaskEvent.parameters = new Array()

  joinedTaskEvent.parameters.push(
    new ethereum.EventParam("taskId", ethereum.Value.fromUnsignedBigInt(taskId))
  )
  joinedTaskEvent.parameters.push(
    new ethereum.EventParam("agent", ethereum.Value.fromAddress(agent))
  )

  return joinedTaskEvent
}

export function createRecordedContributionEvent(
  taskId: BigInt,
  contributor: Address,
  value: BigInt
): RecordedContribution {
  let recordedContributionEvent =
    changetype<RecordedContribution>(newMockEvent())

  recordedContributionEvent.parameters = new Array()

  recordedContributionEvent.parameters.push(
    new ethereum.EventParam("taskId", ethereum.Value.fromUnsignedBigInt(taskId))
  )
  recordedContributionEvent.parameters.push(
    new ethereum.EventParam(
      "contributor",
      ethereum.Value.fromAddress(contributor)
    )
  )
  recordedContributionEvent.parameters.push(
    new ethereum.EventParam("value", ethereum.Value.fromUnsignedBigInt(value))
  )

  return recordedContributionEvent
}

export function createRoleAdminChangedEvent(
  role: Bytes,
  previousAdminRole: Bytes,
  newAdminRole: Bytes
): RoleAdminChanged {
  let roleAdminChangedEvent = changetype<RoleAdminChanged>(newMockEvent())

  roleAdminChangedEvent.parameters = new Array()

  roleAdminChangedEvent.parameters.push(
    new ethereum.EventParam("role", ethereum.Value.fromFixedBytes(role))
  )
  roleAdminChangedEvent.parameters.push(
    new ethereum.EventParam(
      "previousAdminRole",
      ethereum.Value.fromFixedBytes(previousAdminRole)
    )
  )
  roleAdminChangedEvent.parameters.push(
    new ethereum.EventParam(
      "newAdminRole",
      ethereum.Value.fromFixedBytes(newAdminRole)
    )
  )

  return roleAdminChangedEvent
}

export function createRoleGrantedEvent(
  role: Bytes,
  account: Address,
  sender: Address
): RoleGranted {
  let roleGrantedEvent = changetype<RoleGranted>(newMockEvent())

  roleGrantedEvent.parameters = new Array()

  roleGrantedEvent.parameters.push(
    new ethereum.EventParam("role", ethereum.Value.fromFixedBytes(role))
  )
  roleGrantedEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )
  roleGrantedEvent.parameters.push(
    new ethereum.EventParam("sender", ethereum.Value.fromAddress(sender))
  )

  return roleGrantedEvent
}

export function createRoleRevokedEvent(
  role: Bytes,
  account: Address,
  sender: Address
): RoleRevoked {
  let roleRevokedEvent = changetype<RoleRevoked>(newMockEvent())

  roleRevokedEvent.parameters = new Array()

  roleRevokedEvent.parameters.push(
    new ethereum.EventParam("role", ethereum.Value.fromFixedBytes(role))
  )
  roleRevokedEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )
  roleRevokedEvent.parameters.push(
    new ethereum.EventParam("sender", ethereum.Value.fromAddress(sender))
  )

  return roleRevokedEvent
}

export function createTaskRewardsDistributedEvent(
  taskId: BigInt
): TaskRewardsDistributed {
  let taskRewardsDistributedEvent =
    changetype<TaskRewardsDistributed>(newMockEvent())

  taskRewardsDistributedEvent.parameters = new Array()

  taskRewardsDistributedEvent.parameters.push(
    new ethereum.EventParam("taskId", ethereum.Value.fromUnsignedBigInt(taskId))
  )

  return taskRewardsDistributedEvent
}
