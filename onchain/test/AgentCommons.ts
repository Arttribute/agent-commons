import { expect } from "chai";
import { ethers } from "hardhat";

describe("Agent Commons Comprehensive Tests (Option B: Agent Owns Resource)", function () {
  let agentRegistry: any;
  let commonToken: any;
  let commonResource: any;
  let attribution: any;
  let taskManager: any;

  let deployer: any;
  let reputationManager: any;
  let coreAdmin: any;
  let coreResourceCreator: any;
  let agent1: any;
  let agent2: any;
  let outsider: any;

  const REPUTATION_MANAGER_ROLE = ethers.keccak256(
    ethers.toUtf8Bytes("REPUTATION_MANAGER_ROLE")
  );
  const CORE_ADMIN_ROLE = ethers.keccak256(
    ethers.toUtf8Bytes("CORE_ADMIN_ROLE")
  );
  const CORE_RESOURCE_CREATOR_ROLE = ethers.keccak256(
    ethers.toUtf8Bytes("CORE_RESOURCE_CREATOR_ROLE")
  );
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));

  beforeEach(async function () {
    [
      deployer,
      reputationManager,
      coreAdmin,
      coreResourceCreator,
      agent1,
      agent2,
      outsider,
    ] = await ethers.getSigners();

    // ------------------------------------------------------------------------
    // Deploy AgentRegistry
    // ------------------------------------------------------------------------
    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    agentRegistry = await AgentRegistry.connect(deployer).deploy();
    await agentRegistry.waitForDeployment();

    await agentRegistry
      .connect(deployer)
      .grantRole(REPUTATION_MANAGER_ROLE, reputationManager.address);

    // ------------------------------------------------------------------------
    // Deploy CommonToken
    // ------------------------------------------------------------------------
    const CommonToken = await ethers.getContractFactory("CommonToken");
    commonToken = await CommonToken.connect(deployer).deploy();
    await commonToken.waitForDeployment();

    // Deploy => set roles
    await commonToken
      .connect(deployer)
      .grantRole(MINTER_ROLE, deployer.address);
    await commonToken
      .connect(deployer)
      .grantRole(BURNER_ROLE, deployer.address);

    // ------------------------------------------------------------------------
    // Deploy CommonResource
    // ------------------------------------------------------------------------
    const CommonResource = await ethers.getContractFactory("CommonResource");
    commonResource = await CommonResource.connect(deployer).deploy(
      commonToken.getAddress(),
      agentRegistry.getAddress()
    );
    await commonResource.waitForDeployment();

    // Let CommonResource burn tokens
    await commonToken
      .connect(deployer)
      .grantRole(BURNER_ROLE, commonResource.getAddress());
    // Let CommonResource update rep
    await agentRegistry
      .connect(deployer)
      .grantRole(REPUTATION_MANAGER_ROLE, commonResource.getAddress());

    // Grant admin roles
    await commonResource
      .connect(deployer)
      .grantRole(CORE_ADMIN_ROLE, coreAdmin.address);
    await commonResource
      .connect(deployer)
      .grantRole(CORE_RESOURCE_CREATOR_ROLE, coreResourceCreator.address);

    // ------------------------------------------------------------------------
    // Deploy Attribution
    // ------------------------------------------------------------------------
    const Attribution = await ethers.getContractFactory("Attribution");
    attribution = await Attribution.connect(deployer).deploy(
      commonResource.getAddress(),
      agentRegistry.getAddress()
    );
    await attribution.waitForDeployment();

    // Let attribution contract update rep
    await agentRegistry
      .connect(deployer)
      .grantRole(REPUTATION_MANAGER_ROLE, attribution.getAddress());

    // ------------------------------------------------------------------------
    // Deploy TaskManager
    // ------------------------------------------------------------------------
    const TaskManager = await ethers.getContractFactory("TaskManager");
    taskManager = await TaskManager.connect(deployer).deploy(
      commonToken.getAddress(),
      agentRegistry.getAddress(),
      commonResource.getAddress()
    );
    await taskManager.waitForDeployment();

    // Optionally let TaskManager update rep if needed
    await agentRegistry
      .connect(deployer)
      .grantRole(REPUTATION_MANAGER_ROLE, taskManager.getAddress());

    // ------------------------------------------------------------------------
    // Register some agents
    // ------------------------------------------------------------------------
    await agentRegistry
      .connect(deployer)
      .registerAgent(agent1.address, "metadata-agent1", false);
    await agentRegistry
      .connect(deployer)
      .registerAgent(agent2.address, "metadata-agent2", false);
    await agentRegistry
      .connect(deployer)
      .registerAgent(
        coreResourceCreator.address,
        "metadata-core-creator",
        true
      );

    // Also register TaskManager contract as an agent if it might create resources directly
    const tmAddr = await taskManager.getAddress();
    await agentRegistry
      .connect(deployer)
      .registerAgent(tmAddr, "TaskManager", false);
  });

  // --------------------------------------------------------------------------
  // Utility to parse logs
  function parseEvent(receipt: any, contractIface: any, eventName: string) {
    for (const log of receipt.logs) {
      try {
        const parsed = contractIface.parseLog({
          data: log.data,
          topics: log.topics,
        });
        if (parsed && parsed.name === eventName) {
          return parsed;
        }
      } catch {}
    }
    return null;
  }

  // ==========================================================================
  // AgentRegistry Tests
  // ==========================================================================
  describe("AgentRegistry", function () {
    it("Should allow registration of a new agent", async function () {
      await agentRegistry
        .connect(deployer)
        .registerAgent(outsider.address, "outsider", false);
      const data = await agentRegistry.agents(outsider.address);
      expect(data.owner).to.equal(deployer.address);
      expect(data.metadata).to.equal("outsider");
      expect(data.reputation).to.equal(0n);
    });

    it("Should revert if agent is registered twice", async function () {
      try {
        await agentRegistry
          .connect(deployer)
          .registerAgent(agent1.address, "xxx", false);
        expect.fail("Expected revert for double registration");
      } catch (err: any) {
        expect(err.message).to.match(/Agent already registered/);
      }
    });

    it("Should only allow REPUTATION_MANAGER to update rep", async function () {
      try {
        await agentRegistry
          .connect(agent1)
          .updateReputation(agent2.address, 10);
        expect.fail("Expected revert for missing role");
      } catch (err: any) {
        expect(err.message).to.match(/AccessControl/);
      }

      await agentRegistry
        .connect(reputationManager)
        .updateReputation(agent2.address, 10n);
      const agent2Data = await agentRegistry.agents(agent2.address);
      expect(agent2Data.reputation).to.equal(10n);
    });

    it.skip("Should cap rep=0 if negative update > current rep (two's complement)", async function () {
      // If you want negative rep logic, unskip & do:
      await agentRegistry
        .connect(reputationManager)
        .updateReputation(agent1.address, 5n);
      const before = await agentRegistry.agents(agent1.address);
      expect(before.reputation).to.equal(5n);

      // -10 => "0x...fff6"
      const negative10 =
        "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6";
      await agentRegistry
        .connect(reputationManager)
        .updateReputation(agent1.address, negative10);

      const after = await agentRegistry.agents(agent1.address);
      expect(after.reputation).to.equal(0n);
    });
  });

  // ==========================================================================
  // CommonToken Tests
  // ==========================================================================
  describe("CommonToken", function () {
    it("Should mint tokens if caller has MINTER_ROLE", async function () {
      await commonToken
        .connect(deployer)
        .mint(agent1.address, ethers.parseEther("100"));
      const bal = await commonToken.balanceOf(agent1.address);
      expect(bal).to.equal(ethers.parseEther("100"));
    });

    it("Should burn tokens if caller has BURNER_ROLE", async function () {
      await commonToken
        .connect(deployer)
        .mint(agent1.address, ethers.parseEther("100"));
      try {
        await commonToken
          .connect(agent1)
          .burn(agent1.address, ethers.parseEther("50"));
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/AccessControl/);
      }

      await commonToken
        .connect(deployer)
        .burn(agent1.address, ethers.parseEther("50"));
      const bal = await commonToken.balanceOf(agent1.address);
      expect(bal).to.equal(ethers.parseEther("50"));
    });

    it("Should mint tokens when receiving ETH (fallback)", async function () {
      const oneEth = ethers.parseEther("1");
      await agent1.sendTransaction({
        to: commonToken.getAddress(),
        value: oneEth,
      });
      const minted = oneEth * 100000n;
      const after = await commonToken.balanceOf(agent1.address);
      expect(after.toString()).to.equal(minted.toString());
    });
  });

  // ==========================================================================
  // CommonResource Tests
  // ==========================================================================
  describe("CommonResource", function () {
    let coreId: bigint;
    let nonCoreId: bigint;

    beforeEach(async function () {
      // create core resource by coreResourceCreator
      const tx1 = await commonResource
        .connect(coreResourceCreator)
        .createResource(
          coreResourceCreator.address, // actualCreator is ignored for core
          "core-meta",
          "core-file",
          0,
          ethers.parseEther("10"),
          [],
          [],
          true
        );
      const rc1 = await tx1.wait();
      let createdEv = parseEvent(
        rc1,
        commonResource.interface,
        "ResourceCreated"
      );
      coreId = createdEv.args.resourceId;

      // agent1 => +100 rep
      await agentRegistry
        .connect(reputationManager)
        .updateReputation(agent1.address, 100n);

      // create non-core
      const tx2 = await commonResource.connect(agent1).createResource(
        agent1.address, // actualCreator => agent1
        "ncore-meta",
        "ncore-file",
        10,
        ethers.parseEther("5"),
        [agent1.address],
        [100],
        false
      );
      const rc2 = await tx2.wait();
      createdEv = parseEvent(rc2, commonResource.interface, "ResourceCreated");
      nonCoreId = createdEv.args.resourceId;
    });

    it("Should allow only CORE_RESOURCE_CREATOR_ROLE to create core resources", async function () {
      try {
        await commonResource
          .connect(agent1)
          .createResource(
            agent1.address,
            "fake-core",
            "file",
            0,
            0,
            [],
            [],
            true
          );
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(
          /Not authorized to create default resources/
        );
      }
    });

    it("Should revert if non-registered agent tries to create non-core resource", async function () {
      try {
        await commonResource
          .connect(outsider)
          .createResource(outsider.address, "xxx", "file", 0, 0, [], [], false);
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/Not a registered agent/);
      }
    });

    it("Should store resource data correctly", async function () {
      const c = await commonResource.resources(coreId);
      expect(c.isCoreResource).to.equal(true);
      expect(c.usageCost).to.equal(ethers.parseEther("10"));
      expect(c.creator).to.equal("0x0000000000000000000000000000000000000000");

      const nc = await commonResource.resources(nonCoreId);
      expect(nc.isCoreResource).to.equal(false);
      expect(nc.requiredReputation).to.equal(10n);
      expect(nc.usageCost).to.equal(ethers.parseEther("5"));
      expect(nc.creator).to.equal(agent1.address);
    });

    it("Should mint ERC1155 shares to contributors for non-core resources", async function () {
      const bal = await commonResource.balanceOf(agent1.address, nonCoreId);
      expect(bal).to.equal(100n);
    });

    it("Should allow using a core resource => leftover => rep in Wei", async function () {
      // usageCost=10e18
      await commonToken
        .connect(deployer)
        .mint(agent2.address, ethers.parseEther("50"));
      await commonToken
        .connect(agent2)
        .approve(commonResource.getAddress(), ethers.parseEther("50"));

      const tx = await commonResource
        .connect(agent2)
        .useResource(coreId, ethers.parseEther("15"));
      const rc = await tx.wait();
      const usedEv = parseEvent(rc, commonResource.interface, "ResourceUsed");
      expect(usedEv).to.not.be.undefined;

      const afterBal = await commonToken.balanceOf(agent2.address);
      expect(afterBal).to.equal(ethers.parseEther("35"));

      // leftover => 5e18 => rep= 5e18
      const agent2Data = await agentRegistry.agents(agent2.address);
      expect(agent2Data.reputation.toString()).to.equal(
        ethers.parseEther("5").toString()
      );
    });

    it("Should allow using a non-core resource => leftover => rep in Wei", async function () {
      await agentRegistry
        .connect(reputationManager)
        .updateReputation(agent2.address, 20n);

      await commonToken
        .connect(deployer)
        .mint(agent2.address, ethers.parseEther("10"));
      await commonToken
        .connect(agent2)
        .approve(commonResource.getAddress(), ethers.parseEther("10"));

      // usageCost=5e18 => pay=8e18 => leftover=3e18 => final rep= 20 + 3e18 => 3000000000000000020
      const tx = await commonResource
        .connect(agent2)
        .useResource(nonCoreId, ethers.parseEther("8"));
      await tx.wait();

      const bal2 = await commonToken.balanceOf(agent2.address);
      expect(bal2).to.equal(ethers.parseEther("2"));

      const bal1 = await commonToken.balanceOf(agent1.address);
      expect(bal1).to.equal(ethers.parseEther("5"));

      const agent2Data = await agentRegistry.agents(agent2.address);
      const expectedRep = (20n + ethers.parseEther("3")).toString();
      expect(agent2Data.reputation.toString()).to.equal(expectedRep);
    });

    it("Should revert if user rep < requiredReputation", async function () {
      await commonToken
        .connect(deployer)
        .mint(agent2.address, ethers.parseEther("5"));
      await commonToken
        .connect(agent2)
        .approve(commonResource.getAddress(), ethers.parseEther("5"));

      try {
        await commonResource
          .connect(agent2)
          .useResource(nonCoreId, ethers.parseEther("5"));
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/Insufficient reputation/);
      }
    });

    it("Should allow creator or CORE_ADMIN to update usageCost or requiredReputation", async function () {
      await commonResource.connect(agent1).updateResourceCost(nonCoreId, 42);
      let info = await commonResource.resources(nonCoreId);
      expect(info.usageCost).to.equal(42n);

      await commonResource
        .connect(agent1)
        .updateResourceReputationRequirement(nonCoreId, 99);
      info = await commonResource.resources(nonCoreId);
      expect(info.requiredReputation).to.equal(99n);

      await commonResource
        .connect(coreAdmin)
        .updateResourceCost(nonCoreId, 100);
      info = await commonResource.resources(nonCoreId);
      expect(info.usageCost).to.equal(100n);

      try {
        await commonResource
          .connect(outsider)
          .updateResourceCost(nonCoreId, 999);
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/Not authorized/);
      }
    });
  });

  // ==========================================================================
  // Attribution Tests
  // ==========================================================================
  describe("Attribution", function () {
    let newResId: bigint;

    beforeEach(async function () {
      await agentRegistry
        .connect(reputationManager)
        .updateReputation(agent1.address, 50n);

      // agent1 => create a resource
      const tx = await commonResource
        .connect(agent1)
        .createResource(
          agent1.address,
          "res-meta",
          "res-file",
          10,
          0,
          [agent1.address],
          [100],
          false
        );
      const rc = await tx.wait();
      const evt = parseEvent(rc, commonResource.interface, "ResourceCreated");
      newResId = evt.args.resourceId;
    });

    it("Should only allow resource owner to record attribution", async function () {
      try {
        await attribution
          .connect(agent2)
          .recordAttribution(newResId, [], [], []);
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/Only resource creator/);
      }
    });

    it("Should revert if arrays mismatch", async function () {
      try {
        await attribution
          .connect(agent1)
          .recordAttribution(newResId, [1, 2], [0], ["desc1", "desc2"]);
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/Arrays length mismatch/);
      }
    });

    it("Should record parent => child, citations, rep update", async function () {
      const tx1 = await commonResource
        .connect(agent1)
        .createResource(
          agent1.address,
          "p1",
          "p1-file",
          0,
          0,
          [agent1.address],
          [100],
          false
        );
      const rc1 = await tx1.wait();
      const p1Evt = parseEvent(
        rc1,
        commonResource.interface,
        "ResourceCreated"
      );
      const parent1 = p1Evt.args.resourceId;

      const tx2 = await commonResource
        .connect(agent1)
        .createResource(
          agent1.address,
          "p2",
          "p2-file",
          0,
          0,
          [agent1.address],
          [100],
          false
        );
      const rc2 = await tx2.wait();
      const p2Evt = parseEvent(
        rc2,
        commonResource.interface,
        "ResourceCreated"
      );
      const parent2 = p2Evt.args.resourceId;

      // each parent => +1e18
      const txA = await attribution
        .connect(agent1)
        .recordAttribution(
          newResId,
          [parent1, parent2],
          [0, 2],
          ["Using p1", "Using p2"]
        );
      const rcA = await txA.wait();
      const attEvt = parseEvent(
        rcA,
        attribution.interface,
        "AttributionRecorded"
      );
      expect(attEvt).to.not.be.undefined;
      expect(attEvt.args.resourceId).to.equal(newResId);

      const agent1Data = await agentRegistry.agents(agent1.address);
      // started=50 => +2*(1e18) => 50 + 2e18
      const expectedRep = 50n + 2n * 10n ** 18n;
      expect(agent1Data.reputation.toString()).to.equal(expectedRep.toString());
    });
  });

  // ==========================================================================
  // TaskManager Tests
  // ==========================================================================
  describe("TaskManager", function () {
    it("Should allow creating a non-resource-based task with deposit", async function () {
      await commonToken.connect(deployer).mint(agent1.address, 200n);
      await commonToken.connect(agent1).approve(taskManager.getAddress(), 200n);

      const tx = await taskManager
        .connect(agent1)
        .createTask("meta", "description", 100, false, 0, 2);
      const rc = await tx.wait();
      const createdEv = parseEvent(rc, taskManager.interface, "CreatedTask");
      expect(createdEv).to.not.be.undefined;
      expect(createdEv.args.creator).to.equal(agent1.address);

      const bal = await commonToken.balanceOf(taskManager.getAddress());
      expect(bal).to.equal(100n);
    });

    it("Should allow creating a resource-based task without deposit", async function () {
      const tx = await taskManager
        .connect(agent1)
        .createTask("resource-task", "description", 10, true, 0, 5);
      const rc = await tx.wait();
      const evt = parseEvent(rc, taskManager.interface, "CreatedTask");
      const taskId = evt.args.taskId;

      const tInfo = await taskManager.getTask(taskId);
      expect(tInfo.reward).to.equal(10n);
      expect(tInfo.resourceBased).to.equal(true);

      const bal = await commonToken.balanceOf(taskManager.getAddress());
      expect(bal).to.equal(0n);
    });

    it("Should allow tasks to have subtasks (parent-child)", async function () {
      await commonToken.connect(deployer).mint(agent1.address, 300n);
      await commonToken.connect(agent1).approve(taskManager.getAddress(), 300n);

      const tx = await taskManager
        .connect(agent1)
        .createTask("parent", "description", 100, false, 0, 2);
      const rc = await tx.wait();
      const pEvt = parseEvent(rc, taskManager.interface, "CreatedTask");
      const parentId = pEvt.args.taskId;

      const tx2 = await taskManager
        .connect(agent1)
        .createTask("child", "description", 50, false, parentId, 2);
      const rc2 = await tx2.wait();
      const cEvt = parseEvent(rc2, taskManager.interface, "CreatedTask");
      const childId = cEvt.args.taskId;

      const pInfo = await taskManager.getTask(parentId);
      expect(pInfo.subtasks.length).to.equal(1);
      expect(pInfo.subtasks[0]).to.equal(childId);

      const cInfo = await taskManager.getTask(childId);
      expect(cInfo.parentTaskId).to.equal(parentId);
    });

    it("Should revert if non-registered agent tries to create a task", async function () {
      try {
        await taskManager
          .connect(outsider)
          .createTask("xx", "description", 50, false, 0, 2);
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/Not a registered agent/);
      }
    });

    it("Should allow agents to join tasks if open and within maxParticipants", async function () {
      await commonToken.connect(deployer).mint(agent1.address, 100n);
      await commonToken.connect(agent1).approve(taskManager.getAddress(), 100n);

      const tx = await taskManager
        .connect(agent1)
        .createTask("join", "description", 100, false, 0, 1);
      const rc = await tx.wait();
      const evt = parseEvent(rc, taskManager.interface, "CreatedTask");
      const taskId = evt.args.taskId;

      const jTx = await taskManager.connect(agent2).joinTask(taskId);
      const jRc = await jTx.wait();
      const jEvt = parseEvent(jRc, taskManager.interface, "JoinedTask");
      expect(jEvt.args.agent).to.equal(agent2.address);

      try {
        await taskManager.connect(outsider).joinTask(taskId);
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/Not a registered agent/);
      }
    });

    it("Should revert if maxParticipants is reached", async function () {
      await commonToken.connect(deployer).mint(agent1.address, 100n);
      await commonToken.connect(agent1).approve(taskManager.getAddress(), 100n);

      const tx = await taskManager
        .connect(agent1)
        .createTask("test", "description", 100, false, 0, 1);
      const rc = await tx.wait();
      const evt = parseEvent(rc, taskManager.interface, "CreatedTask");
      const taskId = evt.args.taskId;

      await taskManager.connect(agent2).joinTask(taskId);

      try {
        await taskManager.connect(agent1).joinTask(taskId);
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/Max participants reached/);
      }
    });

    it("Should only allow creator to record contributions, and only for joined participants", async function () {
      await commonToken.connect(deployer).mint(agent1.address, 100n);
      await commonToken.connect(agent1).approve(taskManager.getAddress(), 100n);

      const tx = await taskManager
        .connect(agent1)
        .createTask("meta", "description", 100, false, 0, 2);
      const rc = await tx.wait();
      const cEvt = parseEvent(rc, taskManager.interface, "CreatedTask");
      const taskId = cEvt.args.taskId;

      await taskManager.connect(agent2).joinTask(taskId);

      try {
        await taskManager
          .connect(agent2)
          .recordContribution(taskId, agent2.address, 10);
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/Only creator can add contributions/);
      }

      try {
        await taskManager
          .connect(agent1)
          .recordContribution(taskId, agent1.address, 10);
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/Must join task/);
      }

      await taskManager.connect(agent1).joinTask(taskId);
      await taskManager
        .connect(agent1)
        .recordContribution(taskId, agent2.address, 10);
    });

    it("Should allow completing a non-resource-based task, distributing rewards", async function () {
      await commonToken.connect(deployer).mint(agent1.address, 300n);
      await commonToken.connect(agent1).approve(taskManager.getAddress(), 300n);

      const tx = await taskManager
        .connect(agent1)
        .createTask("task", "description", 100, false, 0, 3);
      const rc = await tx.wait();
      const e = parseEvent(rc, taskManager.interface, "CreatedTask");
      const taskId = e.args.taskId;

      await taskManager.connect(agent1).joinTask(taskId);
      await taskManager.connect(agent2).joinTask(taskId);

      await taskManager
        .connect(agent1)
        .recordContribution(taskId, agent1.address, 50);
      await taskManager
        .connect(agent1)
        .recordContribution(taskId, agent2.address, 50);

      const cTx = await taskManager
        .connect(agent1)
        .completeTask(taskId, "file");
      const cRc = await cTx.wait();
      const cEvt = parseEvent(cRc, taskManager.interface, "CompletedTask");
      expect(cEvt).to.not.be.undefined;

      const distEvt = parseEvent(
        cRc,
        taskManager.interface,
        "TaskRewardsDistributed"
      );
      expect(distEvt).to.not.be.undefined;

      const a1Bal = await commonToken.balanceOf(agent1.address);
      expect(a1Bal).to.equal(250n);

      const a2Bal = await commonToken.balanceOf(agent2.address);
      expect(a2Bal).to.equal(50n);
    });

    it("Should revert completing a task if not the creator", async function () {
      await commonToken.connect(deployer).mint(agent1.address, 200n);
      await commonToken.connect(agent1).approve(taskManager.getAddress(), 200n);
      const tx = await taskManager
        .connect(agent1)
        .createTask("x", "d", 100, false, 0, 2);
      const rc = await tx.wait();
      const e = parseEvent(rc, taskManager.interface, "CreatedTask");
      const taskId = e.args.taskId;

      try {
        await taskManager.connect(agent2).completeTask(taskId, "file");
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/Only creator can complete task/);
      }
    });

    it("Should revert completing a parent task if a subtask is not completed", async function () {
      await commonToken.connect(deployer).mint(agent1.address, 300n);
      await commonToken.connect(agent1).approve(taskManager.getAddress(), 300n);
      const tx = await taskManager
        .connect(agent1)
        .createTask("parent", "description", 100, false, 0, 2);
      const rc = await tx.wait();
      const pEvt = parseEvent(rc, taskManager.interface, "CreatedTask");
      const parentId = pEvt.args.taskId;

      const tx2 = await taskManager
        .connect(agent1)
        .createTask("child", "description", 50, false, parentId, 2);
      const rc2 = await tx2.wait();
      const cEvt = parseEvent(rc2, taskManager.interface, "CreatedTask");
      const childId = cEvt.args.taskId;

      try {
        await taskManager.connect(agent1).completeTask(parentId, "pfile");
        expect.fail("Expected revert");
      } catch (err: any) {
        expect(err.message).to.match(/All subtasks must be completed/);
      }
    });

    it("Should allow completing a resource-based task => creates a CommonResource (creator=agent1)", async function () {
      const tx = await taskManager
        .connect(agent1)
        .createTask("res-based", "description", 5, true, 0, 2);
      const rc = await tx.wait();
      const e = parseEvent(rc, taskManager.interface, "CreatedTask");
      const taskId = e.args.taskId;

      await taskManager.connect(agent2).joinTask(taskId);
      await taskManager
        .connect(agent1)
        .recordContribution(taskId, agent2.address, 10);

      // Now complete => we pass `task.creator`=agent1 to CommonResource => agent1 is set as the resource creator
      const cTx = await taskManager
        .connect(agent1)
        .completeTask(taskId, "output-file");
      const cRc = await cTx.wait();

      const resEvt = parseEvent(
        cRc,
        commonResource.interface,
        "ResourceCreated"
      );
      expect(resEvt).to.not.be.undefined;
      // Check that the actual resource creator is agent1, not the TaskManager
      expect(resEvt.args.creator).to.equal(agent1.address);

      const resourceId = resEvt.args.resourceId;
      const rInfo = await commonResource.resources(resourceId);
      expect(rInfo.metadata).to.equal("res-based");
      expect(rInfo.resourceFile).to.equal("output-file");
      expect(rInfo.usageCost).to.equal(5n);
      expect(rInfo.isCoreResource).to.equal(false);

      // agent2 => minted shares=10
      const sharesBal = await commonResource.balanceOf(
        agent2.address,
        resourceId
      );
      expect(sharesBal).to.equal(10n);
    });
  });
  // ==========================================================================
  // Example Scenario Tests
  // ==========================================================================
  describe("Example Scenario Tests", function () {
    it("Scenario 1: Creating a Film", async function () {
      // Agents: agent1 => plot, agent2 => video creation, agent3 => voice acting
      const agent3 = outsider; // let's treat 'outsider' as agent3 but register it
      await agentRegistry
        .connect(deployer)
        .registerAgent(agent3.address, "agent3-voice", false);

      // They create a "Film" resource-based task
      await commonToken.connect(deployer).mint(agent1.address, 1000n);
      await commonToken
        .connect(agent1)
        .approve(taskManager.getAddress(), 1000n);

      const createTx = await taskManager
        .connect(agent1)
        .createTask("FilmProject", "description", 50, true, 0, 3);
      const cr = await createTx.wait();
      const createEvt = parseEvent(cr, taskManager.interface, "CreatedTask");
      const filmTaskId = createEvt.args.taskId;

      // agent2 => join, agent3 => join
      await taskManager.connect(agent2).joinTask(filmTaskId);
      await taskManager.connect(agent3).joinTask(filmTaskId);
      // agent1 => also must join
      await taskManager.connect(agent1).joinTask(filmTaskId);

      // Record contributions: agent1 => 30, agent2 => 50, agent3 => 20
      await taskManager
        .connect(agent1)
        .recordContribution(filmTaskId, agent1.address, 30);
      await taskManager
        .connect(agent1)
        .recordContribution(filmTaskId, agent2.address, 50);
      await taskManager
        .connect(agent1)
        .recordContribution(filmTaskId, agent3.address, 20);

      // Complete => creates a CommonResource
      const compTx = await taskManager
        .connect(agent1)
        .completeTask(filmTaskId, "final-film-file");
      const compRc = await compTx.wait();
      const resEvt = parseEvent(
        compRc,
        commonResource.interface,
        "ResourceCreated"
      );
      expect(resEvt).to.not.be.undefined;

      // final resource => usageCost=50, shares => [30, 50, 20]
      const resourceId = resEvt.args.resourceId;
      const rInfo = await commonResource.resources(resourceId);
      expect(rInfo.metadata).to.equal("FilmProject");
      expect(rInfo.resourceFile).to.equal("final-film-file");
      expect(rInfo.usageCost).to.equal(50n);

      // agent2 => should have share=50
      const bal2 = await commonResource.balanceOf(agent2.address, resourceId);
      expect(bal2).to.equal(50n);
      // agent3 => share=20
      const bal3 = await commonResource.balanceOf(agent3.address, resourceId);
      expect(bal3).to.equal(20n);
    });

    it("Scenario 2: Dataset Sourcing & Training Models", async function () {
      // Step 1: agents gather data => produce a dataset => resource
      // We'll do a resource-based "DatasetSourcing" task with reward=0 if we want
      const createTx = await taskManager
        .connect(agent1)
        .createTask("DatasetSourcing", "description", 0, true, 0, 2);
      const cr = await createTx.wait();
      const createEvt = parseEvent(cr, taskManager.interface, "CreatedTask");
      const datasetTaskId = createEvt.args.taskId;

      // agent1 & agent2 join
      await taskManager.connect(agent1).joinTask(datasetTaskId);
      await taskManager.connect(agent2).joinTask(datasetTaskId);

      // record contributions => agent1=70, agent2=30
      await taskManager
        .connect(agent1)
        .recordContribution(datasetTaskId, agent1.address, 70);
      await taskManager
        .connect(agent1)
        .recordContribution(datasetTaskId, agent2.address, 30);

      // complete => create dataset resource
      const compTx = await taskManager
        .connect(agent1)
        .completeTask(datasetTaskId, "dataset-file");
      const compRc = await compTx.wait();
      const dsResEvt = parseEvent(
        compRc,
        commonResource.interface,
        "ResourceCreated"
      );
      expect(dsResEvt).to.not.be.undefined;
      const datasetResId = dsResEvt.args.resourceId;

      // Step 2: specialized agent trains a model => also resource-based
      const modelTx = await taskManager
        .connect(agent2)
        .createTask("TrainModel", "description", 0, true, 0, 1);
      const modelRc = await modelTx.wait();
      const modelEvt = parseEvent(
        modelRc,
        taskManager.interface,
        "CreatedTask"
      );
      const modelTaskId = modelEvt.args.taskId;

      await taskManager.connect(agent2).joinTask(modelTaskId);
      // record => agent2=100
      await taskManager
        .connect(agent2)
        .recordContribution(modelTaskId, agent2.address, 100);

      // complete => "trained-model-file"
      const modelCompTx = await taskManager
        .connect(agent2)
        .completeTask(modelTaskId, "trained-model-file");
      const modelCompRc = await modelCompTx.wait();
      const modelResEvt = parseEvent(
        modelCompRc,
        commonResource.interface,
        "ResourceCreated"
      );
      expect(modelResEvt).to.not.be.undefined;

      const modelResId = modelResEvt.args.resourceId;
      const modelInfo = await commonResource.resources(modelResId);
      expect(modelInfo.metadata).to.equal("TrainModel");
      expect(modelInfo.resourceFile).to.equal("trained-model-file");
    });

    it("Scenario 3: Creating New Tools & Documentation", async function () {
      // Agents find a need => create a new API => also create docs => each is a resource
      // We'll do it with 2 tasks: "ToolCreation" (resource-based) & "DocsCreation" (also resource-based)

      // 1) "ToolCreation"
      const toolTx = await taskManager
        .connect(agent1)
        .createTask("ToolCreation", "description", 100, true, 0, 2);
      const toolRc = await toolTx.wait();
      const toolEvt = parseEvent(toolRc, taskManager.interface, "CreatedTask");
      const toolTaskId = toolEvt.args.taskId;

      // agent1 => code dev, agent2 => QA
      await taskManager.connect(agent1).joinTask(toolTaskId);
      await taskManager.connect(agent2).joinTask(toolTaskId);
      // record => agent1=80, agent2=20
      await taskManager
        .connect(agent1)
        .recordContribution(toolTaskId, agent1.address, 80);
      await taskManager
        .connect(agent1)
        .recordContribution(toolTaskId, agent2.address, 20);

      // complete => new API resource
      const toolCompTx = await taskManager
        .connect(agent1)
        .completeTask(toolTaskId, "api-file");
      const toolCompRc = await toolCompTx.wait();
      const toolResEvt = parseEvent(
        toolCompRc,
        commonResource.interface,
        "ResourceCreated"
      );
      expect(toolResEvt).to.not.be.undefined;
      const toolResId = toolResEvt.args.resourceId;

      // 2) "DocsCreation"
      const docsTx = await taskManager
        .connect(agent2)
        .createTask("DocsCreation", "description", 50, true, 0, 2);
      const docsRc = await docsTx.wait();
      const docsEvt = parseEvent(docsRc, taskManager.interface, "CreatedTask");
      const docsTaskId = docsEvt.args.taskId;

      await taskManager.connect(agent2).joinTask(docsTaskId);
      await taskManager.connect(agent1).joinTask(docsTaskId);

      // agent2 => 60, agent1 => 40
      await taskManager
        .connect(agent2)
        .recordContribution(docsTaskId, agent2.address, 60);
      await taskManager
        .connect(agent2)
        .recordContribution(docsTaskId, agent1.address, 40);

      // complete => new doc resource
      const docsCompTx = await taskManager
        .connect(agent2)
        .completeTask(docsTaskId, "docs-file");
      const docsCompRc = await docsCompTx.wait();
      const docsResEvt = parseEvent(
        docsCompRc,
        commonResource.interface,
        "ResourceCreated"
      );
      expect(docsResEvt).to.not.be.undefined;
      const docsResId = docsResEvt.args.resourceId;

      // final check
      const toolResource = await commonResource.resources(toolResId);
      expect(toolResource.metadata).to.equal("ToolCreation");
      expect(toolResource.resourceFile).to.equal("api-file");
      expect(toolResource.usageCost).to.equal(100n);

      const docsResource = await commonResource.resources(docsResId);
      expect(docsResource.metadata).to.equal("DocsCreation");
      expect(docsResource.resourceFile).to.equal("docs-file");
      expect(docsResource.usageCost).to.equal(50n);
    });
  });
});
