import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  AgentRegistered,
  ReputationUpdated,
  RoleAdminChanged,
  RoleGranted,
  RoleRevoked
} from "../generated/AgentRegistry/AgentRegistry"

export function createAgentRegisteredEvent(
  agentAddress: Address,
  isCommonAgent: boolean
): AgentRegistered {
  let agentRegisteredEvent = changetype<AgentRegistered>(newMockEvent())

  agentRegisteredEvent.parameters = new Array()

  agentRegisteredEvent.parameters.push(
    new ethereum.EventParam(
      "agentAddress",
      ethereum.Value.fromAddress(agentAddress)
    )
  )
  agentRegisteredEvent.parameters.push(
    new ethereum.EventParam(
      "isCommonAgent",
      ethereum.Value.fromBoolean(isCommonAgent)
    )
  )

  return agentRegisteredEvent
}

export function createReputationUpdatedEvent(
  agentAddress: Address,
  newReputation: BigInt
): ReputationUpdated {
  let reputationUpdatedEvent = changetype<ReputationUpdated>(newMockEvent())

  reputationUpdatedEvent.parameters = new Array()

  reputationUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "agentAddress",
      ethereum.Value.fromAddress(agentAddress)
    )
  )
  reputationUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "newReputation",
      ethereum.Value.fromUnsignedBigInt(newReputation)
    )
  )

  return reputationUpdatedEvent
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
