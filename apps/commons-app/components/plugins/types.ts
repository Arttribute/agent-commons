export type UiPluginStatus = "draft" | "active" | "disabled";

export type UiPluginSurfaceType = "page" | "widget";

export type UiPluginSurface = {
  type: UiPluginSurfaceType;
  title?: string;
  width?: number;
  height?: number;
};

export type UiPluginPermission = "theme.read" | "navigation" | "storage";

export type UiPluginCapabilityName =
  | "agents.read"
  | "tasks.read"
  | "tasks.write"
  | "workflows.read"
  | "workflows.execute"
  | "library.read"
  | "tools.read"
  | "copilot.prompt";

export type UiPluginCapabilityGrant = {
  name: UiPluginCapabilityName;
  resourceIds?: string[];
};

export type UiPlugin = {
  pluginId: string;
  name: string;
  slug: string;
  description?: string | null;
  version: string;
  entryUrl: string;
  deploymentId: string | null;
  status: UiPluginStatus;
  manifest: {
    schemaVersion: "1" | "2";
    surfaces: UiPluginSurface[];
    permissions: UiPluginPermission[];
    capabilities?: UiPluginCapabilityGrant[];
    networkAccess?: { allowedDomains: string[] };
  };
  updatedAt: string;
};

export function isUiPlugin(value: unknown): value is UiPlugin {
  if (!value || typeof value !== "object") return false;
  const plugin = value as Partial<UiPlugin>;
  const manifest = plugin.manifest;
  return Boolean(
    typeof plugin.pluginId === "string" &&
      typeof plugin.name === "string" &&
      typeof plugin.slug === "string" &&
      typeof plugin.version === "string" &&
      typeof plugin.entryUrl === "string" &&
      (plugin.deploymentId === null ||
        typeof plugin.deploymentId === "string") &&
      ["draft", "active", "disabled"].includes(plugin.status ?? "") &&
      manifest &&
      ["1", "2"].includes(manifest.schemaVersion) &&
      Array.isArray(manifest.permissions) &&
      Array.isArray(manifest.surfaces) &&
      manifest.surfaces.length > 0 &&
      manifest.surfaces.every(
        (surface) =>
          surface && ["page", "widget"].includes(surface.type),
      ) &&
      (manifest.capabilities === undefined ||
        Array.isArray(manifest.capabilities))
  );
}
