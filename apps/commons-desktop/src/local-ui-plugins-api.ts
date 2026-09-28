import type { LocalApp } from "@agent-commons/desktop-contract";
import type { PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";
import { LocalAppData, LocalAppDataError } from "./local-app-data";

const DEFAULT_MANIFEST = {
  schemaVersion: "1",
  surfaces: [{ type: "page" }, { type: "widget" }],
  permissions: [],
  networkAccess: { allowedDomains: [] },
};

/** Local apps use the Cloud app shape so the same Apps UI serves both modes. */
export function plugin(app: LocalApp) {
  const manifest: Record<string, unknown> = { ...DEFAULT_MANIFEST, ...(app.manifest ?? {}), networkAccess: { allowedDomains: [] } };
  return {
    pluginId: app.id,
    name: app.name,
    slug: `local-${app.id}`,
    description: app.description ?? (app.cloudPluginId ? "Kept on this computer from Commons Cloud" : "Runs from a folder on this computer"),
    version: "1.0.0",
    entryUrl: app.previewUrl,
    deploymentId: null,
    status: app.status === "running" ? "active" : "disabled",
    manifest,
    iconUrl: null,
    location: "local",
    localDirectory: app.directory,
    cloudPluginId: app.cloudPluginId ?? null,
    runState: app.status,
    effectiveCapabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : [],
    updatedAt: app.updatedAt,
  };
}

const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });

let appData: LocalAppData | null = null;

function rpcResult(id: unknown, result: unknown): LocalApiResult {
  return { status: 200, body: { jsonrpc: "2.0", id, result } };
}

function rpcError(id: unknown, code: number, message: string): LocalApiResult {
  return { status: 200, body: { jsonrpc: "2.0", id, error: { code, message } } };
}

/**
 * App requests in Private Local. Data, agents, tasks, Library, and Knowledge
 * answers come from this computer; methods that need Commons Cloud (network
 * connections, agent runs, credits) return a clear error instead.
 */
function localRpc(runtime: PrivateLocalRuntime, app: LocalApp, body: Record<string, unknown>) {
  const request = body.request && typeof body.request === "object" ? body.request as Record<string, unknown> : {};
  const id = request.id ?? null;
  const method = String(request.method ?? "");
  const params = request.params && typeof request.params === "object" ? request.params as Record<string, unknown> : {};
  const manifest = plugin(app).manifest as Record<string, unknown>;
  const granted = new Set((Array.isArray(manifest.capabilities) ? manifest.capabilities : [])
    .map((grant) => (grant && typeof grant === "object" ? String((grant as Record<string, unknown>).name ?? "") : "")));
  const requires = (capability: string) => {
    if (!granted.has(capability)) throw new LocalAppDataError(-32001, `This app was not granted the ${capability} capability.`);
  };
  const state = runtime.state();
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(params.limit) || 50)));
  try {
    if (method.startsWith("data.")) {
      requires(method === "data.get" || method === "data.query" || method === "data.collections" ? "data.read" : "data.write");
      appData ??= new LocalAppData(runtime.appsDirectory());
      const declared = Array.isArray((manifest.data as Record<string, unknown> | undefined)?.collections)
        ? ((manifest.data as { collections: Array<{ name: string; description?: string }> }).collections)
        : [];
      return rpcResult(id, appData.execute(app.id, method, params, declared));
    }
    switch (method) {
      case "agents.list":
        requires("agents.read");
        return rpcResult(id, { items: state.agents.slice(0, limit).map((agent) => ({ agentId: agent.id, name: agent.name, description: agent.description ?? null })), total: state.agents.length });
      case "tasks.list":
        requires("tasks.read");
        return rpcResult(id, { items: state.tasks.slice(0, limit).map((task) => ({ taskId: task.id, title: task.title, status: task.status, agentId: task.agentId, dueAt: task.dueAt ?? null })), total: state.tasks.length });
      case "library.list":
        requires("library.read");
        return rpcResult(id, { items: (state.library ?? []).slice(0, limit).map((item) => ({ itemId: item.id, name: item.name, mimeType: item.mimeType, createdAt: item.createdAt })), total: state.library?.length ?? 0 });
      case "spaces.list":
        requires("spaces.read");
        return rpcResult(id, { items: state.spaces.slice(0, limit).map((space) => ({ spaceId: space.id, name: space.name, documents: space.files.length })), total: state.spaces.length });
      case "skills.list":
        requires("skills.read");
        return rpcResult(id, { items: (state.skills ?? []).slice(0, limit).map((skill) => ({ skillId: skill.id, slug: skill.slug, name: skill.name, description: skill.description })), total: state.skills?.length ?? 0 });
      case "workflows.list":
        requires("workflows.read");
        return rpcResult(id, { items: state.workflows.slice(0, limit).map((workflow) => ({ workflowId: workflow.id, name: workflow.name, description: workflow.description ?? null })), total: state.workflows.length });
      case "sessions.list":
        requires("sessions.read");
        return rpcResult(id, { items: state.conversations.slice(0, limit).map((conversation) => ({ sessionId: conversation.id, agentId: conversation.agentId, title: conversation.title, updatedAt: conversation.updatedAt })), total: state.conversations.length });
    }
    return rpcError(id, -32050, "This app feature needs Commons Cloud. Switch to Cloud to use it.");
  } catch (error) {
    if (error instanceof LocalAppDataError) return rpcError(id, error.code, error.message);
    return rpcError(id, -32050, error instanceof Error ? error.message : "The app request failed.");
  }
}

export async function handleLocalUiPluginsApi(runtime: PrivateLocalRuntime, url: URL, method: string, body: Record<string, unknown>): Promise<LocalApiResult> {
  try {
    const parts = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
    if (!parts.length) {
      if (method === "GET") return ok(runtime.state().apps.map(plugin));
    }
    if (parts[0] === "layout") {
      if (method === "GET") return ok({ scopes: { global: runtime.preferences().pinnedAppIds?.value ?? [] }, maxPinned: 6 });
      if (method === "PUT") {
        const ids = Array.isArray(body.pluginIds) ? body.pluginIds.filter((id): id is string => typeof id === "string").slice(0, 6) : [];
        runtime.syncPreferences({ pinnedAppIds: { value: ids, updatedAt: Date.now() } }, "private-local");
        return ok({ scopes: { global: ids }, maxPinned: 6 });
      }
      if (method === "DELETE") {
        runtime.syncPreferences({ pinnedAppIds: { value: [], updatedAt: Date.now() } }, "private-local");
        return ok({ scopes: { global: [] }, maxPinned: 6 });
      }
    }
    if (parts[0] === "slug" && parts[1] && method === "GET") {
      const app = runtime.state().apps.find((item) => `local-${item.id}` === parts[1]);
      return app ? ok(plugin(app)) : bad("Local app not found", 404);
    }
    const app = runtime.state().apps.find((item) => item.id === parts[0]);
    if (parts[0] && parts[1] === "rpc" && method === "POST") {
      if (!app || app.status !== "running") return rpcError((body.request as Record<string, unknown> | undefined)?.id ?? null, -32001, "This custom app is no longer enabled.");
      return localRpc(runtime, app, body);
    }
    if (parts[0] && parts.length === 1) {
      if (!app) return bad("Local app not found", 404);
      if (method === "GET") return ok(plugin(app));
      if (method === "DELETE") {
        await runtime.deleteApp(app.id);
        return ok({ deleted: true });
      }
    }
    if (parts[0] && parts[1] === "status" && method === "PUT") {
      const status = String(body.status ?? "");
      const state = status === "active" ? await runtime.startApp(parts[0]) :
        status === "disabled" ? await runtime.stopApp(parts[0]) : null;
      if (!state) return bad("Invalid Local app status");
      const updated = state.apps.find((item) => item.id === parts[0]);
      return updated ? ok(plugin(updated)) : bad("Local app not found", 404);
    }
    return bad("Unsupported Local app operation", 404);
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Local app operation failed");
  }
}
