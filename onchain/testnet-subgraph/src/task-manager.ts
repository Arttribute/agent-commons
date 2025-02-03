import {
  CompletedTask as CompletedTaskEvent,
  CreatedTask as CreatedTaskEvent,
  JoinedTask as JoinedTaskEvent,
  RecordedContribution as RecordedContributionEvent,
  RoleAdminChanged as RoleAdminChangedEvent,
  RoleGranted as RoleGrantedEvent,
  RoleRevoked as RoleRevokedEvent,
  TaskRewardsDistributed as TaskRewardsDistributedEvent,
} from "../generated/TaskManager/TaskManager"
import {
  CompletedTask,
  CreatedTask,
  JoinedTask,
  RecordedContribution,
  RoleAdminChanged,
  RoleGranted,
  RoleRevoked,
  TaskRewardsDistributed,
} from "../generated/schema"

export function handleCompletedTask(event: CompletedTaskEvent): void {
  let entity = new CompletedTask(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.taskId = event.params.taskId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleCreatedTask(event: CreatedTaskEvent): void {
  let entity = new CreatedTask(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.taskId = event.params.taskId
  entity.creator = event.params.creator
  entity.parentTaskId = event.params.parentTaskId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleJoinedTask(event: JoinedTaskEvent): void {
  let entity = new JoinedTask(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.taskId = event.params.taskId
  entity.agent = event.params.agent

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleRecordedContribution(
  event: RecordedContributionEvent,
): void {
  let entity = new RecordedContribution(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.taskId = event.params.taskId
  entity.contributor = event.params.contributor
  entity.value = event.params.value

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleRoleAdminChanged(event: RoleAdminChangedEvent): void {
  let entity = new RoleAdminChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.role = event.params.role
  entity.previousAdminRole = event.params.previousAdminRole
  entity.newAdminRole = event.params.newAdminRole

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleRoleGranted(event: RoleGrantedEvent): void {
  let entity = new RoleGranted(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.role = event.params.role
  entity.account = event.params.account
  entity.sender = event.params.sender

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleRoleRevoked(event: RoleRevokedEvent): void {
  let entity = new RoleRevoked(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.role = event.params.role
  entity.account = event.params.account
  entity.sender = event.params.sender

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTaskRewardsDistributed(
  event: TaskRewardsDistributedEvent,
): void {
  let entity = new TaskRewardsDistributed(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.taskId = event.params.taskId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
