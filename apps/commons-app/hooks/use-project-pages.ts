"use client";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
export type PageConfig = {
  title: string;
  description: string;
  publicContext: string;
  chatEnabled: boolean;
  imageUrl?: string;
};
export type ProjectPage = {
  pageId: string;
  projectId: string;
  codeProjectId: string;
  slug: string;
  surface: "commons" | "commonlab" | "business";
  status: "draft" | "published";
  draftConfig: PageConfig;
  publishedConfig?: PageConfig | null;
  publishedAt?: string;
  publicPath: string;
  projectName?: string;
  source?: {
    agentId: string;
    framework: string;
    files: Array<{ path: string; content: string; binary: boolean }>;
    deployments: Array<{ status: string; publicUrl?: string }>;
  };
};
async function request(path: string, method = "GET", body?: unknown) {
  const response = await desktopApiFetch(path, {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof json.message === "string"
        ? json.message
        : json.error || "The page request failed",
    );
  return json.data;
}
const root = (projectId: string, pageId?: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/pages${pageId ? "/" + encodeURIComponent(pageId) : ""}`;
export const projectPagesApi = {
  list: (projectId: string): Promise<ProjectPage[]> => request(root(projectId)),
  create: (
    projectId: string,
    input: Partial<PageConfig> & {
      title: string;
      slug: string;
      surface: string;
      template: string;
      agentId?: string;
      registrationUrl?: string;
    },
  ): Promise<ProjectPage> => request(root(projectId), "POST", input),
  get: (projectId: string, pageId: string): Promise<ProjectPage> =>
    request(root(projectId, pageId)),
  update: (
    projectId: string,
    pageId: string,
    input: PageConfig,
  ): Promise<ProjectPage> => request(root(projectId, pageId), "PATCH", input),
  files: (
    projectId: string,
    pageId: string,
    files: Array<{ path: string; content: string }>,
  ): Promise<ProjectPage> =>
    request(root(projectId, pageId) + "/files", "PUT", { files }),
  action: (
    projectId: string,
    pageId: string,
    action: "preview" | "publish" | "unpublish",
  ) => request(root(projectId, pageId) + "/" + action, "POST", {}),
  async import(
    projectId: string,
    pageId: string,
    file: File,
  ): Promise<ProjectPage> {
    if (file.size > 3_000_000)
      throw new Error(
        "The browser upload limit is 3 MB. Use the documented import API for ZIPs up to 8 MB.",
      );
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(root(projectId, pageId) + "/import", {
      method: "POST",
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        payload.message || payload.error || "The website could not be imported",
      );
    return payload.data;
  },
};
