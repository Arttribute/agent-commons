"use client";

import { useCallback, useEffect, useState } from "react";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";

export type ProjectSummary = {
  projectId: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  agentId?: string | null;
  knowledgeSpaceIds: string[];
  libraryItemIds: string[];
  pinned: boolean;
  location: "cloud" | "local";
  sessionCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDetail = ProjectSummary & {
  knowledgeSpaces: Array<{
    spaceId: string;
    name: string;
    documents?: number;
    linkedFolder?: string;
    git?: { branch?: string; commit?: string };
  }>;
  files: Array<{
    itemId: string;
    name: string;
    mimeType: string;
    kind?: string;
    sizeBytes?: number;
    keepOnDevice?: boolean;
    inCloud?: boolean;
  }>;
  tasks: Array<{
    taskId: string;
    title: string;
    status: string;
    cronExpression?: string | null;
    scheduledFor?: string | null;
    dueAt?: string | null;
  }>;
};

export type ProjectInput = Partial<
  Pick<ProjectSummary, "name" | "description" | "instructions" | "agentId" | "knowledgeSpaceIds" | "libraryItemIds" | "pinned">
>;

const CHANGED = "commons-projects-changed";

/** Tells every project list and sidebar to reload. */
export function notifyProjectsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGED));
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message ?? payload?.error;
    throw new Error(Array.isArray(message) ? message.join(", ") : message || "Project request failed");
  }
  return payload?.data;
}

export const projectsApi = {
  async list(): Promise<ProjectSummary[]> {
    const data = await readJson(await desktopApiFetch("/api/projects", { cache: "no-store" }));
    return Array.isArray(data) ? data : [];
  },
  async get(projectId: string): Promise<ProjectDetail> {
    return readJson(await desktopApiFetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" }));
  },
  async create(input: ProjectInput): Promise<ProjectDetail> {
    const project = await readJson(await desktopApiFetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }));
    notifyProjectsChanged();
    return project;
  },
  async update(projectId: string, input: ProjectInput): Promise<ProjectDetail> {
    const project = await readJson(await desktopApiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }));
    notifyProjectsChanged();
    return project;
  },
  async remove(projectId: string) {
    await readJson(await desktopApiFetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" }));
    notifyProjectsChanged();
  },
  async sessions(projectId: string): Promise<Array<{ sessionId: string; agentId: string; title?: string | null; updatedAt: string; createdAt: string }>> {
    const data = await readJson(await desktopApiFetch(`/api/projects/${encodeURIComponent(projectId)}/sessions`, { cache: "no-store" }));
    return Array.isArray(data) ? data : [];
  },
  async moveSession(sessionId: string, projectId: string | null) {
    await readJson(await desktopApiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    }));
    notifyProjectsChanged();
  },
};

/** Projects for the current workspace mode, refreshed when any view changes one. */
export function useProjects(enabled = true) {
  const { mode } = useWorkspaceMode();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setError(null);
      setProjects(await projectsApi.list());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    setLoading(enabled);
    void refresh();
  }, [refresh, mode, enabled]);

  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener(CHANGED, onChange);
    return () => window.removeEventListener(CHANGED, onChange);
  }, [refresh]);

  useEffect(() => {
    if (mode !== "private-local") return;
    return window.agentCommonsLocal?.onEvent((event) => {
      if (event.type === "state") void refresh();
    });
  }, [mode, refresh]);

  return { projects, loading, error, refresh, setProjects };
}
