import type { LocalTask } from "@agent-commons/desktop-contract";
import type { PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";

const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });

function taskView(task: LocalTask, runtime: PrivateLocalRuntime) {
  return {
    taskId: task.id, agentId: task.agentId, sessionId: task.sessionId ?? "",
    title: task.title, description: task.description ?? task.prompt,
    status: task.status, executionMode: "single", scheduledFor: task.dueAt,
    nextRunAt: task.status === "pending" ? task.dueAt : undefined,
    priority: task.priority ?? 0, progress: task.status === "completed" ? 100 : task.status === "running" ? 50 : 0,
    resultContent: task.result, summary: task.status === "completed" ? task.result : undefined,
    errorMessage: task.status === "failed" ? task.result : undefined,
    createdBy: runtime.state().account?.userId ?? "local-workspace", createdByType: "user",
    createdAt: task.createdAt, updatedAt: task.updatedAt,
  };
}

export async function handleLocalTasksApi(runtime: PrivateLocalRuntime, url: URL, method: string, body: Record<string, unknown>): Promise<LocalApiResult> {
  try {
    const parts = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
    const tasks = runtime.state().tasks;
    if (!parts.length) {
      if (method === "GET") return ok(tasks.filter((task) => !url.searchParams.get("agentId") || task.agentId === url.searchParams.get("agentId")).map((task) => taskView(task, runtime)));
      if (method === "POST") {
        const agentId = String(body.agentId ?? "");
        if (!runtime.state().agents.some((agent) => agent.id === agentId)) return bad("Choose a Local agent first");
        const title = String(body.title ?? "").trim();
        if (!title) return bad("Task title is required");
        const dueAt = typeof body.scheduledFor === "string" && body.scheduledFor ? new Date(body.scheduledFor).toISOString() : undefined;
        const state = runtime.saveTask({
          title, prompt: String(body.description ?? title), description: String(body.description ?? ""),
          agentId, sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
          dueAt, priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0,
        });
        return ok(taskView(state.tasks[0], runtime));
      }
    }
    const task = tasks.find((entry) => entry.id === parts[0]);
    if (!task) return bad("Local task not found", 404);
    if (parts.length === 1) {
      if (method === "GET") return ok(taskView(task, runtime));
      if (method === "DELETE") { runtime.deleteTask(task.id); return ok({ deleted: true }); }
      if (method === "PATCH") {
        const state = runtime.saveTask({ id: task.id, title: typeof body.title === "string" ? body.title : task.title,
          prompt: typeof body.description === "string" ? body.description : task.prompt,
          description: typeof body.description === "string" ? body.description : task.description,
          agentId: task.agentId, sessionId: task.sessionId, dueAt: task.dueAt,
          priority: body.priority === undefined ? task.priority : Number(body.priority),
        });
        return ok(taskView(state.tasks.find((entry) => entry.id === task.id)!, runtime));
      }
    }
    if (parts[1] === "schedule" && method === "PATCH") {
      const dueAt = typeof body.scheduledFor === "string" ? new Date(body.scheduledFor).toISOString() : task.dueAt;
      const state = runtime.saveTask({ id: task.id, title: task.title, prompt: task.prompt, description: task.description,
        agentId: task.agentId, sessionId: task.sessionId, dueAt, priority: task.priority });
      return ok(taskView(state.tasks.find((entry) => entry.id === task.id)!, runtime));
    }
    if (parts[1] === "execute" && method === "POST") {
      void runtime.runTask(task.id).catch(() => undefined);
      return ok(taskView(runtime.state().tasks.find((entry) => entry.id === task.id)!, runtime));
    }
    if (parts[1] === "cancel" && method === "POST") {
      const state = runtime.cancelTask(task.id);
      return ok(taskView(state.tasks.find((entry) => entry.id === task.id)!, runtime));
    }
    return bad("Unsupported Local task operation", 404);
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Local task operation failed");
  }
}
