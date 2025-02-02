const hre = require("hardhat");
import * as dotenv from "dotenv";

dotenv.config();

const contractOwner = process.env.CONTRACT_OWNER;

async function main() {
  if (!contractOwner) {
    throw new Error("CONTRACT_OWNER not set in .env");
  }

  // Deploy CommonToken contract
  const commonToken = await deployCommonToken(contractOwner);

  // Deploy AgentRegistry contract
  const agentRegistry = await deployAgentRegistry(contractOwner);

  // Deploy CommonResource contract
  const commonResource = await deployCommonResource(
    contractOwner,
    await commonToken.getAddress(),
    await agentRegistry.getAddress()
  );

  // Deploy Attribution contract
  const attribution = await deployAttribution(
    contractOwner,
    await commonToken.getAddress(),
    await agentRegistry.getAddress()
  );

  // Deploy TaskManager contract
  const taskManager = await deployTaskManager(
    contractOwner,
    await commonToken.getAddress(),
    await agentRegistry.getAddress(),
    await commonResource.getAddress()
  );

  console.log("Deployment complete.");
  console.log(`CommonToken deployed at: ${await commonToken.getAddress()}`);
  console.log(`AgentRegistry deployed at: ${await agentRegistry.getAddress()}`);
  console.log(
    `CommonResource deployed at: ${await commonResource.getAddress()}`
  );
  console.log(`Attribution deployed at: ${await attribution.getAddress()}`);
  console.log(`TaskManager deployed at: ${await taskManager.getAddress()}`);
}

async function deployCommonToken(_contractOwner?: string) {
  const CommonToken = await hre.ethers.getContractFactory("CommonToken");
  const commonToken = await CommonToken.deploy();

  console.log(`CommonToken deployed at: ${await commonToken.getAddress()}`);
  return commonToken;
}

async function deployAgentRegistry(_contractOwner?: string) {
  const AgentRegistry = await hre.ethers.getContractFactory("AgentRegistry");
  const agentRegistry = await AgentRegistry.deploy();

  console.log(`AgentRegistry deployed at: ${await agentRegistry.getAddress()}`);
  return agentRegistry;
}

async function deployCommonResource(
  commonTokenAddress: any,
  agentRegistryAddress: any,
  _address?: any
) {
  const CommonResource = await hre.ethers.getContractFactory("CommonResource");
  const commonResource = await CommonResource.deploy(
    commonTokenAddress,
    agentRegistryAddress
  );

  console.log(
    `CommonResource deployed at: ${await commonResource.getAddress()}`
  );
  return commonResource;
}

async function deployAttribution(
  commonResourceAddress: any,
  agentRegistryAddress: any,
  _address?: any
) {
  const Attribution = await hre.ethers.getContractFactory("Attribution");
  const attribution = await Attribution.deploy(
    commonResourceAddress,
    agentRegistryAddress
  );

  console.log(`Attribution deployed at: ${await attribution.getAddress()}`);
  return attribution;
}

async function deployTaskManager(
  commonTokenAddress: any,
  agentRegistryAddress: any,
  commonResourceAddress: any,
  _address?: any
) {
  const TaskManager = await hre.ethers.getContractFactory("TaskManager");
  const taskManager = await TaskManager.deploy(
    commonTokenAddress,
    agentRegistryAddress,
    commonResourceAddress
  );

  console.log(`TaskManager deployed at: ${await taskManager.getAddress()}`);
  return taskManager;
}

// Execute the deployment script
main().catch((error) => {
  console.error("Error deploying contracts:", error);
  process.exitCode = 1;
});
