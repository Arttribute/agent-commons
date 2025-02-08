import {
  AgentRegistry as AgentRegistryContract,
  AgentRegistered as AgentRegisteredEvent,
  ReputationUpdated as ReputationUpdatedEvent,
  RoleAdminChanged as RoleAdminChangedEvent,
  RoleGranted as RoleGrantedEvent,
  RoleRevoked as RoleRevokedEvent,
} from "../generated/AgentRegistry/AgentRegistry";
import {
  Agent,
  RoleAdminChanged,
  RoleGranted,
  RoleRevoked,
} from "../generated/schema";

export function handleAgentRegistered(event: AgentRegisteredEvent): void {
  let agentId = event.params.agentAddress.toHex();

  // Bind to the AgentRegistry contract to fetch full agent data.
  let contract = AgentRegistryContract.bind(event.address);
  let agentData = contract.agents(event.params.agentAddress);

  let agent = new Agent(agentId);
  agent.owner = agentData.value0;
  agent.metadata = agentData.value1;
  agent.reputation = agentData.value2;
  agent.isCommonAgent = agentData.value3;
  agent.registrationTime = agentData.value4;
  agent.save();
}

export function handleReputationUpdated(event: ReputationUpdatedEvent): void {
  let agentId = event.params.agentAddress.toHex();
  let agent = Agent.load(agentId);
  if (agent == null) {
    // If the agent isn’t yet indexed, fetch full data.
    let contract = AgentRegistryContract.bind(event.address);
    let agentData = contract.agents(event.params.agentAddress);
    agent = new Agent(agentId);
    agent.owner = agentData.value0;
    agent.metadata = agentData.value1;
    agent.registrationTime = agentData.value4;
    agent.isCommonAgent = agentData.value3;
  }
  agent.reputation = event.params.newReputation;
  agent.save();
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
