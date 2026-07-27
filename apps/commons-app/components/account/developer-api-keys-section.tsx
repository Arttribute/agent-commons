"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  FolderPlus,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type DeveloperProject = {
  id: string;
  workspaceId: string;
  name: string;
  environment: "production" | "development" | "staging";
  status: string;
};

type DeveloperApiKey = {
  id: string;
  projectId: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  status: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
};

type CreatedDeveloperApiKey = DeveloperApiKey & { key: string };

const EXPIRATIONS = {
  never: null,
  "30-days": 30,
  "90-days": 90,
  "1-year": 365,
} as const;

function expirationDate(value: keyof typeof EXPIRATIONS) {
  const days = EXPIRATIONS[value];
  if (!days) return null;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function responseError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const value =
      "message" in payload
        ? payload.message
        : "error" in payload
          ? payload.error
          : undefined;
    if (typeof value === "string") return value;
  }
  return fallback;
}

export function DeveloperApiKeysSection({
  workspaceId,
}: {
  workspaceId?: string;
}) {
  const [projects, setProjects] = useState<DeveloperProject[]>([]);
  const [keys, setKeys] = useState<DeveloperApiKey[]>([]);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiration, setExpiration] =
    useState<keyof typeof EXPIRATIONS>("never");
  const [newKey, setNewKey] = useState<CreatedDeveloperApiKey | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectEnvironment, setProjectEnvironment] =
    useState<DeveloperProject["environment"]>("development");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/api-keys", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseError(payload, "Could not load developer keys."));
      }
      const nextProjects = Array.isArray(payload.projects)
        ? payload.projects
        : [];
      setProjects(nextProjects);
      setKeys(Array.isArray(payload.data) ? payload.data : []);
      setAvailableScopes(Array.isArray(payload.scopes) ? payload.scopes : []);
      setSelectedProjectId((current) =>
        nextProjects.some((project: DeveloperProject) => project.id === current)
          ? current
          : (nextProjects[0]?.id ?? ""),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load developer keys.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId,
  );
  const visibleKeys = useMemo(
    () => keys.filter((key) => key.projectId === selectedProjectId),
    [keys, selectedProjectId],
  );

  async function createKey() {
    if (!selectedProjectId || !name.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          name: name.trim(),
          scopes: selectedScopes.length ? selectedScopes : undefined,
          expiresAt: expirationDate(expiration),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseError(payload, "Could not create API key."));
      }
      setNewKey(payload.data);
      setName("");
      setSelectedScopes([]);
      setExpiration("never");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create API key.");
    } finally {
      setWorking(false);
    }
  }

  async function createProject() {
    const targetWorkspaceId =
      selectedProject?.workspaceId ?? projects[0]?.workspaceId ?? workspaceId;
    if (!targetWorkspaceId || !projectName.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/api-keys/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: targetWorkspaceId,
          name: projectName.trim(),
          environment: projectEnvironment,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseError(payload, "Could not create project."));
      }
      setProjectName("");
      setShowProjectForm(false);
      await load();
      if (payload.data?.id) setSelectedProjectId(payload.data.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create project.");
    } finally {
      setWorking(false);
    }
  }

  async function revokeKey(key: DeveloperApiKey) {
    if (
      !window.confirm(
        `Revoke “${key.name}”? Applications using this key will stop working immediately.`,
      )
    ) {
      return;
    }
    setRevoking(key.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/api-keys/${encodeURIComponent(key.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(responseError(payload, "Could not revoke API key."));
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke API key.");
    } finally {
      setRevoking(null);
    }
  }

  function toggleScope(scope: string) {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((candidate) => candidate !== scope)
        : [...current, scope],
    );
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey.key);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <div className="max-w-3xl space-y-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Developer API keys</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Project-scoped credentials for the SDK, servers, CI, and automation.
            Use <code className="rounded bg-muted px-1 py-0.5">agc login</code>{" "}
            for interactive CLI access.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowProjectForm((current) => !current)}
        >
          <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
          New project
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {showProjectForm && (
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-[1fr_180px_auto]">
          <Input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Project name"
          />
          <Select
            value={projectEnvironment}
            onValueChange={(value: DeveloperProject["environment"]) =>
              setProjectEnvironment(value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="development">Development</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={createProject}
            disabled={working || !projectName.trim()}
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading developer projects…
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <KeyRound className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Create a developer project first</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Projects isolate credentials, environments, usage, and revocation.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label className="text-xs font-medium">Project</label>
            <Select
              value={selectedProjectId}
              onValueChange={setSelectedProjectId}
            >
              <SelectTrigger className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name} · {project.environment}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProject && (
              <p className="font-mono text-[11px] text-muted-foreground">
                {selectedProject.id}
              </p>
            )}
          </div>

          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <h3 className="text-sm font-medium">Create a key</h3>
              <p className="text-xs text-muted-foreground">
                Grant only the scopes this integration needs.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Production backend"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createKey();
                }}
              />
              <Select
                value={expiration}
                onValueChange={(value: keyof typeof EXPIRATIONS) =>
                  setExpiration(value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never expires</SelectItem>
                  <SelectItem value="30-days">30 days</SelectItem>
                  <SelectItem value="90-days">90 days</SelectItem>
                  <SelectItem value="1-year">1 year</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={createKey}
                disabled={working || !name.trim()}
              >
                {working ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Create key
                  </>
                )}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableScopes.map((scope) => {
                const active = selectedScopes.includes(scope);
                return (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => toggleScope(scope)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                    )}
                  >
                    {scope}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              No scope selected means all currently supported project scopes.
            </p>
          </div>

          <div className="space-y-2">
            {visibleKeys.length === 0 ? (
              <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                No keys in this project yet.
              </p>
            ) : (
              visibleKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{key.name}</p>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          key.status === "active"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {key.status}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {key.keyPrefix}•••• · {key.scopes.join(", ")}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Created {new Date(key.createdAt).toLocaleDateString()}
                      {" · "}
                      Last used{" "}
                      {key.lastUsedAt
                        ? new Date(key.lastUsedAt).toLocaleDateString()
                        : "never"}
                      {" · "}
                      Expires{" "}
                      {key.expiresAt
                        ? new Date(key.expiresAt).toLocaleDateString()
                        : "never"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Revoke ${key.name}`}
                    onClick={() => void revokeKey(key)}
                    disabled={revoking === key.id}
                  >
                    {revoking === key.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <Dialog
        open={Boolean(newKey)}
        onOpenChange={(open) => {
          if (!open) setNewKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Copy it now. For security, Commons stores only a hash and cannot
              show the key again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">
              {newKey?.key}
            </code>
            <Button variant="outline" size="icon" onClick={() => void copyKey()}>
              {copied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Use it with the SDK</p>
            <code className="mt-1 block break-all">
              new CommonsClient({`{ apiKey: process.env.AGENT_COMMONS_API_KEY }`})
            </code>
          </div>
          <Button onClick={() => setNewKey(null)}>I saved the key</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
