import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll,
} from "matchstick-as";
import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import { CompletedTask } from "../generated/schema";
import { CompletedTask as CompletedTaskEvent } from "../generated/TaskManager/TaskManager";
import { handleCompletedTask } from "../src/task-manager";
import { createCompletedTaskEvent } from "./task-manager-utils";

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let taskId = BigInt.fromI32(234);
    let newCompletedTaskEvent = createCompletedTaskEvent(taskId);
    handleCompletedTask(newCompletedTaskEvent);
  });

  afterAll(() => {
    clearStore();
  });

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("CompletedTask created and stored", () => {
    assert.entityCount("CompletedTask", 1);

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "CompletedTask",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "taskId",
      "234"
    );

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  });
});
