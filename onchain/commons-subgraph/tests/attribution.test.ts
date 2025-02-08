import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll,
} from "matchstick-as";
import { BigInt, Bytes, Address } from "@graphprotocol/graph-ts";
import { AttributionRecorded } from "../generated/schema";
import { AttributionRecorded as AttributionRecordedEvent } from "../generated/Attribution/Attribution";
import { handleAttributionRecorded } from "../src/attribution";
import { createAttributionRecordedEvent } from "./attribution-utils";

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let resourceId = BigInt.fromI32(234);
    let parentResources = [BigInt.fromI32(234)];
    let relationTypes = [123];
    let newAttributionRecordedEvent = createAttributionRecordedEvent(
      resourceId,
      parentResources,
      relationTypes
    );
    handleAttributionRecorded(newAttributionRecordedEvent);
  });

  afterAll(() => {
    clearStore();
  });

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("AttributionRecorded created and stored", () => {
    assert.entityCount("AttributionRecorded", 1);

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "AttributionRecorded",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "resourceId",
      "234"
    );
    assert.fieldEquals(
      "AttributionRecorded",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "parentResources",
      "[234]"
    );
    assert.fieldEquals(
      "AttributionRecorded",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "relationTypes",
      "[123]"
    );

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  });
});
