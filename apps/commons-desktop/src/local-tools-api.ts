import { LOCAL_TOOLS, type PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";

/** Catalog of the tools that Local agents can actually call. */
export function handleLocalToolsApi(runtime: PrivateLocalRuntime, url: URL, method: string): LocalApiResult {
  if (url.pathname !== "/api/tools/catalog" || method !== "GET") {
    return { status: 404, body: { message: "Local tool operation not found" } };
  }
  const hasSkills = Boolean(runtime.state().skills?.length);
  const items = LOCAL_TOOLS
    .filter((entry) => entry.function.name !== "invoke_skill" || hasSkills)
    .map((entry) => {
      const name = entry.function.name;
      const displayName = name.replace(/^(?:cli|local)_/, "").split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
      const group = name.startsWith("cli_") ? "Computer" : name.includes("knowledge") || name.includes("note") ? "Knowledge" : name.includes("skill") ? "Skills" : "Local data";
      return {
        id: `local:${name}`, name, displayName, description: entry.function.description,
        category: "system", categoryLabel: "Local tools", connectionMode: "system",
        status: "connected", statusLabel: "Built in", actionLabel: "Available",
        icon: name.includes("search") ? "Search" : name.includes("file") || name.includes("note") ? "FileText" : "Wrench",
        tags: ["local", group.toLowerCase()], verified: true, sourceLabel: "Private Local",
      };
    });
  return { status: 200, body: { items, total: items.length, meta: { mode: "private-local", generatedAt: new Date().toISOString() } } };
}
