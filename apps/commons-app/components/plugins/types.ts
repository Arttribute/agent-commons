import type { UiPluginCapabilityName } from "./capabilities";

export type UiPluginStatus = "draft" | "active" | "disabled";

export type UiPluginSurfaceType = "page" | "widget";

export type UiPluginSurface = {
  type: UiPluginSurfaceType;
  title?: string;
  width?: number;
  height?: number;
};

export type UiPluginPermission = "theme.read" | "navigation" | "storage";

export type { UiPluginCapabilityName };

export type UiPluginApproval = "ask" | "auto";

export type UiPluginCapabilityGrant = {
  name: UiPluginCapabilityName;
  resourceIds?: string[];
  approval?: UiPluginApproval;
};

export type UiPluginConnection = {
  key: string;
  name: string;
  description?: string;
  baseUrl: string;
  auth: {
    type: "none" | "bearer" | "header" | "query" | "basic";
    name?: string;
  };
  methods: string[];
  pathPrefixes: string[];
};

export type UiPluginCollection = {
  name: string;
  description?: string;
  fields?: Record<string, { type: string; required?: boolean }>;
};

export type UiPluginGrants = {
  capabilities: UiPluginCapabilityGrant[];
  agentDataAccess: "none" | "read" | "readwrite";
  chatEnabled: boolean;
  reviewedAt: string;
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
    icon?: string;
    category?: string;
    chat?: { when: string; inputDescription?: string };
    connections?: UiPluginConnection[];
    data?: { collections: UiPluginCollection[] };
  };
  iconUrl?: string | null;
  grants?: UiPluginGrants | null;
  /** The owner-approved grant set the API enforces. */
  effectiveCapabilities?: UiPluginCapabilityGrant[];
  updatedAt: string;
};

/** Grants the host enforces: the owner's review, or the manifest for legacy rows. */
export function pluginGrants(plugin: UiPlugin): UiPluginCapabilityGrant[] {
  return plugin.effectiveCapabilities ?? plugin.manifest.capabilities ?? [];
}

export function pluginHasSurface(plugin: UiPlugin, type: UiPluginSurfaceType) {
  return plugin.manifest.surfaces.some((surface) => surface.type === type);
}

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
