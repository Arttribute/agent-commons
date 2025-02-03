import {
  AgentRegistered as AgentRegisteredEvent,
  ReputationUpdated as ReputationUpdatedEvent,
  RoleAdminChanged as RoleAdminChangedEvent,
  RoleGranted as RoleGrantedEvent,
  RoleRevoked as RoleRevokedEvent,
} from "../generated/AgentRegistry/AgentRegistry"
import {
  AgentRegistered,
  ReputationUpdated,
  RoleAdminChanged,
  RoleGranted,
  RoleRevoked,
} from "../generated/schema"

export function handleAgentRegistered(event: AgentRegisteredEvent): void {
  let entity = new AgentRegistered(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.agentAddress = event.params.agentAddress
  entity.isCommonAgent = event.params.isCommonAgent

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleReputationUpdated(event: ReputationUpdatedEvent): void {
  let entity = new ReputationUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.agentAddress = event.params.agentAddress
  entity.newReputation = event.params.newReputation

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
