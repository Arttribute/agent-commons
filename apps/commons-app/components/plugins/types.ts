export type UiPlugin = {
  pluginId: string;
  name: string;
  slug: string;
  description?: string | null;
  version: string;
  entryUrl: string;
  status: "draft" | "active" | "disabled";
  manifest: {
    schemaVersion: "1";
    surfaces: Array<{
      type: "page" | "widget";
      title?: string;
      width?: number;
      height?: number;
    }>;
    permissions: Array<"theme.read" | "navigation">;
  };
  updatedAt: string;
};
