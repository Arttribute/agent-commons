import {
  ApprovalForAll as ApprovalForAllEvent,
  EIP712DomainChanged as EIP712DomainChangedEvent,
  CommonResource as CommonResourceContract,
  ResourceCostUpdated as ResourceCostUpdatedEvent,
  ResourceCreated as ResourceCreatedEvent,
  ResourceReputationUpdated as ResourceReputationUpdatedEvent,
  ResourceUsed as ResourceUsedEvent,
  RoleAdminChanged as RoleAdminChangedEvent,
  RoleGranted as RoleGrantedEvent,
  RoleRevoked as RoleRevokedEvent,
  TransferBatch as TransferBatchEvent,
  TransferSingle as TransferSingleEvent,
  URI as URIEvent,
} from "../generated/CommonResource/CommonResource";
import {
  ApprovalForAll,
  EIP712DomainChanged,
  CommonResource as CommonResourceEntity,
  ResourceContributor,
  ResourceUsed,
  RoleAdminChanged,
  RoleGranted,
  RoleRevoked,
  TransferBatch,
  TransferSingle,
  URI,
} from "../generated/schema";

import { Address, BigInt } from "@graphprotocol/graph-ts";

export function handleApprovalForAll(event: ApprovalForAllEvent): void {
  let entity = new ApprovalForAll(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.account = event.params.account;
  entity.operator = event.params.operator;
  entity.approved = event.params.approved;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleEIP712DomainChanged(
  event: EIP712DomainChangedEvent
): void {
  let entity = new EIP712DomainChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleResourceCreated(event: ResourceCreatedEvent): void {
  let id = event.params.resourceId.toString();
  let contract = CommonResourceContract.bind(event.address);
  let resourceData = contract.resources(event.params.resourceId);

  let resource = new CommonResourceEntity(id);
  resource.resourceId = event.params.resourceId;
  resource.creator = resourceData.value0;
  resource.metadata = resourceData.value1;
  resource.resourceFile = resourceData.getResourceFile();
  resource.requiredReputation = resourceData.getRequiredReputation();
  resource.usageCost = resourceData.getUsageCost();
  resource.isCoreResource = resourceData.getIsCoreResource();

  // For non-core resources, create contributor entities and calculate totalShares.
  if (!resource.isCoreResource) {
    let totalShares = BigInt.fromI32(0);
    let contributors = new Array<Address>(); // empty array since contributors not available in ABI
    let shares = new Array<BigInt>(); // empty array since shares not available in ABI
    // If contributors and shares become available in ABI, update these assignments accordingly.
    for (let i = 0; i < shares.length; i++) {
      totalShares = totalShares.plus(shares[i]);
      let contributorId = id + "-" + contributors[i].toHex();
      let contributorEntity = new ResourceContributor(contributorId);
      contributorEntity.resource = id;
      contributorEntity.address = contributors[i];
      contributorEntity.contributionShare = shares[i];
      contributorEntity.save();
    }
    resource.totalShares = totalShares;
  } else {
    resource.totalShares = BigInt.fromI32(0);
  }
  resource.usageCount = BigInt.fromI32(0);
  resource.save();
}

export function handleResourceCostUpdated(
  event: ResourceCostUpdatedEvent
): void {
  let id = event.params.resourceId.toString();
  let resource = CommonResourceEntity.load(id);
  if (resource != null) {
    resource.usageCost = event.params.newCost;
    resource.save();
  }
}

export function handleResourceReputationUpdated(
  event: ResourceReputationUpdatedEvent
): void {
  let id = event.params.resourceId.toString();
  let resource = CommonResourceEntity.load(id);
  if (resource != null) {
    resource.requiredReputation = event.params.newReputation;
    resource.save();
  }
}

export function handleResourceUsed(event: ResourceUsedEvent): void {
  let entity = new ResourceUsed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.resourceId = event.params.resourceId;
  entity.user = event.params.user;
  entity.accessProof = event.params.accessProof;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.save();

  // Update usageCount on the resource
  let resourceId = event.params.resourceId.toString();
  let resource = CommonResourceEntity.load(resourceId);
  if (resource != null) {
    // If usageCount has not been set yet, initialize to zero.
    if (!resource.usageCount) {
      resource.usageCount = BigInt.fromI32(0);
    }
    resource.usageCount = resource.usageCount.plus(BigInt.fromI32(1));
    resource.save();
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

export function handleTransferBatch(event: TransferBatchEvent): void {
  let entity = new TransferBatch(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.operator = event.params.operator;
  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.ids = event.params.ids;
  entity.values = event.params.values;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleTransferSingle(event: TransferSingleEvent): void {
  let entity = new TransferSingle(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.operator = event.params.operator;
  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.internal_id = event.params.id;
  entity.value = event.params.value;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleURI(event: URIEvent): void {
  let entity = new URI(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.value = event.params.value;
  entity.internal_id = event.params.id;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}
