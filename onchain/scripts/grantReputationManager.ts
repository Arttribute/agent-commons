const hre = require("hardhat");
async function main() {
  // Deployed addresses (update if needed)
  const agentRegistryAddress = "0x86d05BF72913b5f462343a42314FC6c90d501575";
  const attributionAddress = "0x7F812FD820a18F199B5C66ff05387DBbEB6694FB";
  const commonResourceAddress = "0x16D3581DFec6e75006cBB6b7c6D513CDd2026a27";

  // Get your signers (the first one usually has the deployer key)
  // Make sure this is an address that has DEFAULT_ADMIN_ROLE on AgentRegistry
  const [admin] = await hre.ethers.getSigners();
  console.log("Using admin address:", admin.address);

  // Attach to the AgentRegistry contract ABI at the known address
  const agentRegistry = await hre.ethers.getContractAt(
    "AgentRegistry",
    agentRegistryAddress,
    admin
  );

  // Fetch the REPUTATION_MANAGER_ROLE bytes32 value
  const reputationManagerRole = await agentRegistry.REPUTATION_MANAGER_ROLE();
  console.log("REPUTATION_MANAGER_ROLE hash:", reputationManagerRole);

  // Grant the role to the Attribution contract
  let tx = await agentRegistry.grantRole(
    reputationManagerRole,
    attributionAddress
  );
  await tx.wait();
  console.log(
    `Granted REPUTATION_MANAGER_ROLE to Attribution at ${attributionAddress}`
  );

  // Grant the role to the CommonResource contract
  tx = await agentRegistry.grantRole(
    reputationManagerRole,
    commonResourceAddress
  );
  await tx.wait();
  console.log(
    `Granted REPUTATION_MANAGER_ROLE to CommonResource at ${commonResourceAddress}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
