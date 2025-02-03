import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  ApprovalForAll,
  EIP712DomainChanged,
  ResourceCostUpdated,
  ResourceCreated,
  ResourceReputationUpdated,
  ResourceUsed,
  RoleAdminChanged,
  RoleGranted,
  RoleRevoked,
  TransferBatch,
  TransferSingle,
  URI
} from "../generated/CommonResource/CommonResource"

export function createApprovalForAllEvent(
  account: Address,
  operator: Address,
  approved: boolean
): ApprovalForAll {
  let approvalForAllEvent = changetype<ApprovalForAll>(newMockEvent())

  approvalForAllEvent.parameters = new Array()

  approvalForAllEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )
  approvalForAllEvent.parameters.push(
    new ethereum.EventParam("operator", ethereum.Value.fromAddress(operator))
  )
  approvalForAllEvent.parameters.push(
    new ethereum.EventParam("approved", ethereum.Value.fromBoolean(approved))
  )

  return approvalForAllEvent
}

export function createEIP712DomainChangedEvent(): EIP712DomainChanged {
  let eip712DomainChangedEvent = changetype<EIP712DomainChanged>(newMockEvent())

  eip712DomainChangedEvent.parameters = new Array()

  return eip712DomainChangedEvent
}

export function createResourceCostUpdatedEvent(
  resourceId: BigInt,
  newCost: BigInt
): ResourceCostUpdated {
  let resourceCostUpdatedEvent = changetype<ResourceCostUpdated>(newMockEvent())

  resourceCostUpdatedEvent.parameters = new Array()

  resourceCostUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "resourceId",
      ethereum.Value.fromUnsignedBigInt(resourceId)
    )
  )
  resourceCostUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "newCost",
      ethereum.Value.fromUnsignedBigInt(newCost)
    )
  )

  return resourceCostUpdatedEvent
}

export function createResourceCreatedEvent(
  resourceId: BigInt,
  creator: Address,
  isCoreResource: boolean
): ResourceCreated {
  let resourceCreatedEvent = changetype<ResourceCreated>(newMockEvent())

  resourceCreatedEvent.parameters = new Array()

  resourceCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "resourceId",
      ethereum.Value.fromUnsignedBigInt(resourceId)
    )
  )
  resourceCreatedEvent.parameters.push(
    new ethereum.EventParam("creator", ethereum.Value.fromAddress(creator))
  )
  resourceCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "isCoreResource",
      ethereum.Value.fromBoolean(isCoreResource)
    )
  )

  return resourceCreatedEvent
}

export function createResourceReputationUpdatedEvent(
  resourceId: BigInt,
  newReputation: BigInt
): ResourceReputationUpdated {
  let resourceReputationUpdatedEvent =
    changetype<ResourceReputationUpdated>(newMockEvent())

  resourceReputationUpdatedEvent.parameters = new Array()

  resourceReputationUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "resourceId",
      ethereum.Value.fromUnsignedBigInt(resourceId)
    )
  )
  resourceReputationUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "newReputation",
      ethereum.Value.fromUnsignedBigInt(newReputation)
    )
  )

  return resourceReputationUpdatedEvent
}

export function createResourceUsedEvent(
  resourceId: BigInt,
  user: Address,
  accessProof: Bytes
): ResourceUsed {
  let resourceUsedEvent = changetype<ResourceUsed>(newMockEvent())

  resourceUsedEvent.parameters = new Array()

  resourceUsedEvent.parameters.push(
    new ethereum.EventParam(
      "resourceId",
      ethereum.Value.fromUnsignedBigInt(resourceId)
    )
  )
  resourceUsedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  resourceUsedEvent.parameters.push(
    new ethereum.EventParam(
      "accessProof",
      ethereum.Value.fromBytes(accessProof)
    )
  )

  return resourceUsedEvent
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

export function createTransferBatchEvent(
  operator: Address,
  from: Address,
  to: Address,
  ids: Array<BigInt>,
  values: Array<BigInt>
): TransferBatch {
  let transferBatchEvent = changetype<TransferBatch>(newMockEvent())

  transferBatchEvent.parameters = new Array()

  transferBatchEvent.parameters.push(
    new ethereum.EventParam("operator", ethereum.Value.fromAddress(operator))
  )
  transferBatchEvent.parameters.push(
    new ethereum.EventParam("from", ethereum.Value.fromAddress(from))
  )
  transferBatchEvent.parameters.push(
    new ethereum.EventParam("to", ethereum.Value.fromAddress(to))
  )
  transferBatchEvent.parameters.push(
    new ethereum.EventParam("ids", ethereum.Value.fromUnsignedBigIntArray(ids))
  )
  transferBatchEvent.parameters.push(
    new ethereum.EventParam(
      "values",
      ethereum.Value.fromUnsignedBigIntArray(values)
    )
  )

  return transferBatchEvent
}

export function createTransferSingleEvent(
  operator: Address,
  from: Address,
  to: Address,
  id: BigInt,
  value: BigInt
): TransferSingle {
  let transferSingleEvent = changetype<TransferSingle>(newMockEvent())

  transferSingleEvent.parameters = new Array()

  transferSingleEvent.parameters.push(
    new ethereum.EventParam("operator", ethereum.Value.fromAddress(operator))
  )
  transferSingleEvent.parameters.push(
    new ethereum.EventParam("from", ethereum.Value.fromAddress(from))
  )
  transferSingleEvent.parameters.push(
    new ethereum.EventParam("to", ethereum.Value.fromAddress(to))
  )
  transferSingleEvent.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  )
  transferSingleEvent.parameters.push(
    new ethereum.EventParam("value", ethereum.Value.fromUnsignedBigInt(value))
  )

  return transferSingleEvent
}

export function createURIEvent(value: string, id: BigInt): URI {
  let uriEvent = changetype<URI>(newMockEvent())

  uriEvent.parameters = new Array()

  uriEvent.parameters.push(
    new ethereum.EventParam("value", ethereum.Value.fromString(value))
  )
  uriEvent.parameters.push(
    new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(id))
  )

  return uriEvent
}
