import type { LocalWorkflow } from "@agent-commons/desktop-contract";
import type { PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";
import { compileLocalWorkflow } from "./local-workflow-plan.mjs";

const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });

function view(workflow: LocalWorkflow, runtime: PrivateLocalRuntime) {
  return {
    workflowId: workflow.id, name: workflow.name, description: workflow.description,
    definition: workflow.definition ?? { nodes: workflow.steps.map((step, index) => ({ id: `step-${index}`, type: "agent_processor", data: { label: step, agentId: workflow.agentId } })), edges: workflow.steps.slice(1).map((_, index) => ({ id: `edge-${index}`, source: `step-${index}`, target: `step-${index + 1}` })) },
    ownerId: runtime.state().account?.userId ?? "local-workspace", ownerType: "user",
    isPublic: false, createdAt: workflow.createdAt, updatedAt: workflow.updatedAt,
  };
}

function stepsFromDefinition(definition: Record<string, unknown> | undefined) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const steps = nodes.flatMap((node) => {
    if (!node || typeof node !== "object") return [];
    const value = node as Record<string, unknown>;
    if (["input", "output"].includes(String(value.type))) return [];
    const data = value.data && typeof value.data === "object" ? value.data as Record<string, unknown> : {};
    const config = value.config && typeof value.config === "object" ? value.config as Record<string, unknown> : {};
    return [String(config.prompt ?? data.prompt ?? data.instructions ?? data.label ?? value.label ?? value.type ?? "Continue workflow")];
  });
  return steps;
}

export async function handleLocalWorkflowsApi(runtime: PrivateLocalRuntime, url: URL, method: string, body: Record<string, unknown>): Promise<LocalApiResult> {
  try {
    const parts = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
    const workflows = runtime.state().workflows;
    if (!parts.length) {
      if (method === "GET") return ok(workflows.map((item) => view(item, runtime)));
      if (method === "POST") {
        const name = String(body.name ?? "").trim();
        if (!name) return bad("Workflow name is required");
        const definition = body.definition && typeof body.definition === "object" && !Array.isArray(body.definition) ? body.definition as Record<string, unknown> : undefined;
        const agentId = String(body.agentId ?? runtime.state().agents[0]?.id ?? "");
        if (!runtime.state().agents.some((agent) => agent.id === agentId)) return bad("Choose a Local agent for this workflow");
        const state = runtime.saveWorkflow({ name, description: typeof body.description === "string" ? body.description : undefined,
          agentId, definition, steps: stepsFromDefinition(definition) });
        return ok(view(state.workflows[0], runtime));
      }
    }
    if (parts[0] === "templates" && method === "GET") return ok([]);
    const workflow = workflows.find((item) => item.id === parts[0]);
    if (!workflow) return bad("Local workflow not found", 404);
    if (parts.length === 1) {
      if (method === "GET") return ok(view(workflow, runtime));
      if (method === "DELETE") { runtime.deleteWorkflow(workflow.id); return ok({ deleted: true }); }
      if (method === "PUT" || method === "PATCH") {
        const definition = body.definition && typeof body.definition === "object" && !Array.isArray(body.definition) ? body.definition as Record<string, unknown> : workflow.definition;
        const name = typeof body.name === "string" ? body.name : workflow.name;
        const state = runtime.saveWorkflow({ id: workflow.id, name, description: typeof body.description === "string" ? body.description : workflow.description,
          agentId: workflow.agentId, workspaceRoot: workflow.workspaceRoot, definition,
          steps: stepsFromDefinition(definition) });
        return ok(view(state.workflows.find((item) => item.id === workflow.id)!, runtime));
      }
    }
    if (parts[1] === "execute" && method === "POST") {
      const inputData = body.inputData && typeof body.inputData === "object" && !Array.isArray(body.inputData)
        ? body.inputData as Record<string, unknown> : undefined;
      const hasGraph = Array.isArray(workflow.definition?.nodes) && workflow.definition.nodes.length > 0;
      const plan = hasGraph
        ? compileLocalWorkflow(workflow.definition, workflow.agentId)
        : workflow.steps.map((prompt, index) => ({ nodeId: `step-${index}`, agentId: workflow.agentId, prompt }));
      if (!plan.length) return bad("Add an agent step before running this Local workflow.");
      if (plan.some((step) => !runtime.state().agents.some((agent) => agent.id === step.agentId))) {
        return bad("A Local workflow agent is unavailable. Choose an available agent before running.");
      }
      void runtime.runWorkflow(workflow.id, inputData).catch(() => undefined);
      const run = runtime.state().workflows.find((item) => item.id === workflow.id)?.lastRun;
      return { status: 200, body: { ...run, workflowId: workflow.id } };
    }
    if (parts[1] === "executions" && method === "GET") {
      const run = workflow.lastRun;
      if (parts[2]) return run?.executionId === parts[2]
        ? { status: 200, body: { ...run, workflowId: workflow.id } }
        : bad("Local workflow run not found", 404);
      return ok(run ? [{ ...run, workflowId: workflow.id }] : []);
    }
    return bad("Unsupported Local workflow operation", 404);
  } catch (error) { return bad(error instanceof Error ? error.message : "Local workflow operation failed"); }
}
