import type { LocalApp } from "@agent-commons/desktop-contract";
import type { PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";

function plugin(app: LocalApp) {
  return {
    pluginId: app.id,
    name: app.name,
    slug: `local-${app.id}`,
    description: `Local app in ${app.directory}`,
    version: "1.0.0",
    entryUrl: app.previewUrl,
    deploymentId: null,
    status: app.status === "running" ? "active" : "draft",
    manifest: { schemaVersion: "1", surfaces: [{ type: "page" }, { type: "widget" }], permissions: [], networkAccess: { allowedDomains: [] } },
    iconUrl: null,
    updatedAt: app.updatedAt,
  };
}

const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });

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
    if (parts[0] && parts[1] === "status" && method === "PUT") {
      const status = String(body.status ?? "");
      const state = status === "active" ? await runtime.startApp(parts[0]) :
        status === "disabled" ? await runtime.stopApp(parts[0]) : null;
      if (!state) return bad("Invalid Local app status");
      const app = state.apps.find((item) => item.id === parts[0]);
      return app ? ok(plugin(app)) : bad("Local app not found", 404);
    }
    return bad("Unsupported Local app operation", 404);
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Local app operation failed");
  }
}
