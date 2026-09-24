import assert from "node:assert/strict";
import { test } from "node:test";
import { compileLocalWorkflow } from "./local-workflow-plan.mjs";

test("Local workflow follows connections and each agent node's saved prompt", () => {
  const definition = {
    startNodeId: "input",
    nodes: [
      { id: "second", type: "agent_processor", agentId: "writer", config: { prompt: "Write the answer" } },
      { id: "output", type: "output" },
      { id: "input", type: "input" },
      { id: "first", type: "agent_processor", config: { agentId: "researcher", prompt: "Find facts" } },
    ],
    edges: [
      { source: "input", target: "first" },
      { source: "first", target: "second" },
      { source: "second", target: "output" },
    ],
  };
  assert.deepEqual(compileLocalWorkflow(definition, "default"), [
    { nodeId: "first", agentId: "researcher", prompt: "Find facts" },
    { nodeId: "second", agentId: "writer", prompt: "Write the answer" },
  ]);
});

test("Local workflow preserves an empty editor draft", () => {
  assert.deepEqual(compileLocalWorkflow({ nodes: [], edges: [] }, "default"), []);
});

test("Local workflow rejects branches and unsupported nodes instead of running a different path", () => {
  const branch = {
    nodes: [
      { id: "input", type: "input" },
      { id: "one", type: "agent_processor" },
      { id: "two", type: "agent_processor" },
    ],
    edges: [{ source: "input", target: "one" }, { source: "input", target: "two" }],
  };
  assert.throws(() => compileLocalWorkflow(branch, "default"), /Branched workflows/);
  assert.throws(() => compileLocalWorkflow({ nodes: [{ id: "tool", type: "tool" }] }, "default"), /not available in Private Local/);
});
