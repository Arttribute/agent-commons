/** Compile the graph saved by the shared editor into the Local agent path. */
export function compileLocalWorkflow(definition, defaultAgentId) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  if (!nodes.length) return [];
  const byId = new Map();
  for (const node of nodes) {
    if (!node || typeof node.id !== "string" || !node.id || byId.has(node.id)) {
      throw new Error("Workflow nodes need unique IDs.");
    }
    byId.set(node.id, node);
  }
  const incoming = new Map([...byId.keys()].map((id) => [id, []]));
  const outgoing = new Map([...byId.keys()].map((id) => [id, []]));
  const edges = Array.isArray(definition?.edges) ? definition.edges : [];
  for (const edge of edges) {
    if (!edge || !byId.has(edge.source) || !byId.has(edge.target)) {
      throw new Error("A workflow connection points to a missing node.");
    }
    outgoing.get(edge.source).push(edge.target);
    incoming.get(edge.target).push(edge.source);
  }
  if ([...incoming.values(), ...outgoing.values()].some((links) => links.length > 1)) {
    throw new Error("Branched workflows need the Cloud workflow engine. Connect Local agent steps in one path.");
  }
  const roots = [...byId.keys()].filter((id) => incoming.get(id).length === 0);
  if (roots.length !== 1 || (definition.startNodeId && definition.startNodeId !== roots[0])) {
    throw new Error("Connect Local workflow nodes into one path with a single start.");
  }
  const path = [];
  const seen = new Set();
  for (let id = roots[0]; id; id = outgoing.get(id)[0]) {
    if (seen.has(id)) throw new Error("Local workflows cannot contain a cycle.");
    seen.add(id);
    path.push(byId.get(id));
  }
  if (seen.size !== nodes.length) throw new Error("Connect every Local workflow node to the main path.");
  const steps = [];
  for (const [index, node] of path.entries()) {
    if (node.type === "input") {
      if (index !== 0) throw new Error("The workflow Input node must come first.");
      continue;
    }
    if (node.type === "output") {
      if (index !== path.length - 1) throw new Error("The workflow Output node must come last.");
      continue;
    }
    if (node.type !== "agent_processor") {
      throw new Error(`The ${String(node.type ?? "unknown")} workflow node is not available in Private Local yet.`);
    }
    const config = node.config && typeof node.config === "object" ? node.config : {};
    const data = node.data && typeof node.data === "object" ? node.data : {};
    const agentId = String(node.agentId || config.agentId || data.agentId || defaultAgentId || "");
    const prompt = String(config.prompt || data.prompt || node.label || data.label || "Process the previous result.").trim();
    if (!agentId) throw new Error(`Choose a Local agent for ${node.label || node.id}.`);
    steps.push({ nodeId: node.id, agentId, prompt });
  }
  return steps;
}
