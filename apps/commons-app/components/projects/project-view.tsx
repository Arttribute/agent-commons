"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Brain,
  Clock,
  Cloud,
  FolderInput,
  GitBranch,
  HardDriveUpload,
  Laptop,
  LibraryBig,
  Loader2,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { useAgents } from "@/hooks/use-agents";
import { projectsApi, type ProjectDetail } from "@/hooks/use-projects";
import { SESSIONS_CHANGED } from "@/hooks/sessions/use-user-sessions";
import { normalizePrincipalId } from "@/lib/principal-id";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { importProjectFolder, canImportProjectFolder } from "@/lib/project-folder-import";
import { relativeTime } from "@/lib/relative-time";
import { artifactLabel, prettyBytes } from "@/lib/artifacts";
import { cn } from "@/lib/utils";
import { StudioAgentLauncher } from "@/components/studio/agent-launcher";
import { LibraryPickerDialog } from "@/components/sessions/chat/library-picker-dialog";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { InfoHint } from "@/components/ui/info-hint";

type ProjectSession = Awaited<ReturnType<typeof projectsApi.sessions>>[number];

export function ProjectView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { authState } = useAuth();
  const { mode } = useWorkspaceMode();
  const local = mode === "private-local";
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { agents } = useAgents(userAddress || undefined);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [sessions, setSessions] = useState<ProjectSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, chats] = await Promise.all([projectsApi.get(projectId), projectsApi.sessions(projectId)]);
      setProject(detail);
      setSessions(chats);
      setMissing(false);
    } catch {
      setMissing(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, mode]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(SESSIONS_CHANGED, refresh);
    return () => window.removeEventListener(SESSIONS_CHANGED, refresh);
  }, [load]);

  const update = async (input: Parameters<typeof projectsApi.update>[1]) => {
    if (!project) return;
    try {
      setProject(await projectsApi.update(project.projectId, input));
    } catch (cause) {
      toast({ title: "Could not update the project", description: cause instanceof Error ? cause.message : undefined, variant: "destructive" });
    }
  };

  const launcherAgents = useMemo(() => agents.map((agent: any) => ({
    agentId: agent.agentId,
    name: agent.name,
    avatar: agent.avatar,
    modelId: agent.modelId,
    isDefault: Boolean(agent.isDefault),
  })), [agents]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (missing || !project) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        This project is not available.
        <Button variant="outline" size="sm" onClick={() => router.push("/projects")}>All projects</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-5">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/projects" className="hover:text-foreground">Projects</Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="truncate text-foreground">{project.name}</span>
      </nav>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-medium tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className="mr-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground"
            title={local ? "This project and its chats stay on this computer" : "This project is saved to Commons Cloud"}
          >
            {local ? <Laptop className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
            {local ? "On this computer" : "Cloud"}
          </span>
          <button
            type="button"
            onClick={() => void update({ pinned: !project.pinned })}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={project.pinned ? "Unpin project" : "Pin project"}
            title={project.pinned ? "Unpin" : "Pin to the top"}
          >
            {project.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Project actions">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <StudioAgentLauncher
            agents={launcherAgents}
            userAddress={userAddress}
            projectId={project.projectId}
            preferredAgentId={project.agentId}
            onAgentChange={(agentId) => void update({ agentId })}
            placeholder="How can we help with this project?"
            hideStarters
          />

          <section className="mt-8">
            {sessions.length ? (
              <>
                <h2 className="mb-2 px-1 text-sm text-muted-foreground">Recents</h2>
                <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-white">
                  {sessions.map((session) => {
                    const agent = agents.find((candidate: any) => candidate.agentId === session.agentId) as any;
                    return (
                      <Link
                        key={session.sessionId}
                        href={`/sessions/${encodeURIComponent(session.sessionId)}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                      >
                        <AgentAvatar name={agent?.name} src={agent?.avatar} size={22} />
                        <span className="min-w-0 flex-1 truncate text-sm">{session.title && session.title !== "New chat" ? session.title : "Untitled chat"}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(session.updatedAt)}</span>
                      </Link>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="mt-10 flex flex-col items-center text-center text-sm text-muted-foreground">
                <MessageSquare className="mb-3 h-5 w-5 text-muted-foreground/60" strokeWidth={1.75} />
                Agents use the same instructions and knowledge every time you chat in this project.
              </div>
            )}
          </section>
        </div>

        <aside className="h-fit overflow-hidden rounded-2xl border border-border bg-white shadow-card">
          <PanelSection
            title="Instructions"
            action={
              <button type="button" onClick={() => setInstructionsOpen(true)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Edit instructions">
                {project.instructions ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-4 w-4" />}
              </button>
            }
          >
            <button type="button" onClick={() => setInstructionsOpen(true)} className="block w-full text-left">
              {project.instructions ? (
                <p className="line-clamp-4 whitespace-pre-wrap text-sm text-foreground/80">{project.instructions}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Add instructions every chat in this project follows.</p>
              )}
            </button>
          </PanelSection>

          <ContextSection project={project} local={local} onChange={update} onReload={load} />

          <PanelSection
            title="Scheduled"
            action={
              <button type="button" onClick={() => setScheduleOpen(true)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Schedule a task">
                <Plus className="h-4 w-4" />
              </button>
            }
            last
          >
            {project.tasks?.length ? (
              <ul className="space-y-1.5">
                {project.tasks.map((task) => (
                  <li key={task.taskId}>
                    <Link href="/studio/tasks" className="flex items-center gap-2 rounded-md py-1 text-sm hover:text-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{scheduleLabel(task)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Set up recurring work, like a weekly updated brief.</p>
            )}
          </PanelSection>
        </aside>
      </div>

      <InstructionsDialog
        open={instructionsOpen}
        onOpenChange={setInstructionsOpen}
        value={project.instructions ?? ""}
        onSave={async (instructions) => update({ instructions })}
      />
      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        name={project.name}
        description={project.description ?? ""}
        onSave={async (name, description) => update({ name, description })}
      />
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        project={project}
        agents={launcherAgents}
        local={local}
        onCreated={() => void load()}
      />
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>Its chats stay in Recents. Files and Knowledge Spaces are not deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await projectsApi.remove(project.projectId).catch(() => undefined);
                router.push("/projects");
              }}
            >
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PanelSection({ title, action, children, last = false, hint }: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
  hint?: string;
}) {
  return (
    <section className={cn("px-5 py-4", !last && "border-b border-border/70")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          {title}
          {hint && <InfoHint>{hint}</InfoHint>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ContextSection({ project, local, onChange, onReload }: {
  project: ProjectDetail;
  local: boolean;
  onChange: (input: { knowledgeSpaceIds?: string[]; libraryItemIds?: string[] }) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [spaces, setSpaces] = useState<Array<{ spaceId: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void desktopApiFetch("/api/knowledge", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setSpaces(Array.isArray(payload?.data) ? payload.data : []))
      .catch(() => setSpaces([]));
  }, [project.knowledgeSpaceIds.length]);

  const addFiles = async (list: FileList) => {
    const files = Array.from(list).filter((file) => file.size > 0);
    if (!files.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const response = await desktopApiFetch("/api/files/upload", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || "Upload failed");
      const ids = (Array.isArray(payload?.data) ? payload.data : []).map((item: any) => item.fileId ?? item.itemId).filter(Boolean);
      await onChange({ libraryItemIds: [...project.libraryItemIds, ...ids] });
    } catch (cause) {
      toast({ title: "Files could not be added", description: cause instanceof Error ? cause.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const importFolder = async () => {
    setBusy(true);
    try {
      const imported = await importProjectFolder(local);
      if (!imported) return;
      await onChange({
        knowledgeSpaceIds: [...new Set([...project.knowledgeSpaceIds, ...imported.knowledgeSpaceIds])],
        libraryItemIds: [...new Set([...project.libraryItemIds, ...imported.libraryItemIds])],
      });
      toast({ title: `${imported.name} added`, description: imported.summary });
    } catch (cause) {
      toast({ title: "The folder could not be imported", description: cause instanceof Error ? cause.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleKeepOnDevice = async (itemId: string, keepOnDevice: boolean) => {
    await desktopApiFetch(`/api/library/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepOnDevice }),
    }).catch(() => undefined);
    await onReload();
  };

  const empty = !project.knowledgeSpaces.length && !project.files.length;

  return (
    <PanelSection
      title="Context"
      hint={local
        ? "Files and knowledge here stay on this computer. Agents in this project can read them in every chat."
        : "Agents in this project can read these files and search these Knowledge Spaces in every chat."}
      action={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={busy} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Add context">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
              <HardDriveUpload className="mr-2 h-4 w-4" /> Upload files
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLibraryOpen(true)}>
              <LibraryBig className="mr-2 h-4 w-4" /> Choose from Library
            </DropdownMenuItem>
            {canImportProjectFolder(local) && (
              <DropdownMenuItem onSelect={() => void importFolder()}>
                <FolderInput className="mr-2 h-4 w-4" /> Import a folder
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Brain className="mr-2 h-4 w-4" /> Knowledge Spaces
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Searched in every chat</DropdownMenuLabel>
                {spaces.map((space) => (
                  <DropdownMenuCheckboxItem
                    key={space.spaceId}
                    checked={project.knowledgeSpaceIds.includes(space.spaceId)}
                    onCheckedChange={(checked) => void onChange({
                      knowledgeSpaceIds: checked
                        ? [...project.knowledgeSpaceIds, space.spaceId]
                        : project.knowledgeSpaceIds.filter((id) => id !== space.spaceId),
                    })}
                  >
                    <span className="truncate">{space.name}</span>
                  </DropdownMenuCheckboxItem>
                ))}
                {!spaces.length && <p className="px-2 py-2 text-xs text-muted-foreground">No Knowledge Spaces yet</p>}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <LibraryPickerDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        attachedFileIds={project.libraryItemIds}
        onAdd={(items) => void onChange({ libraryItemIds: [...new Set([...project.libraryItemIds, ...items.map((item) => item.itemId)])] })}
      />
      {empty ? (
        <p className="text-sm text-muted-foreground">Add files, a folder, or a Knowledge Space. Agents use them in every chat here.</p>
      ) : (
        <div className="space-y-3">
          {project.knowledgeSpaces.length > 0 && (
            <ul className="space-y-1">
              {project.knowledgeSpaces.map((space) => (
                <li key={space.spaceId} className="group flex items-center gap-2 rounded-lg px-1 py-1">
                  <Brain className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  <Link href="/knowledge" className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{space.name}</span>
                    <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      {space.git?.branch && <><GitBranch className="h-3 w-3" />{space.git.branch}{space.git.commit ? ` · ${space.git.commit.slice(0, 7)}` : ""} · </>}
                      {space.documents ?? 0} files{space.linkedFolder ? " · kept in sync" : ""}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void onChange({ knowledgeSpaceIds: project.knowledgeSpaceIds.filter((id) => id !== space.spaceId) })}
                    className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    aria-label={`Remove ${space.name} from the project`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {project.files.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {project.files.map((file) => (
                <div key={file.itemId} className="group relative flex min-h-[92px] flex-col rounded-lg border border-border p-2.5">
                  <span className="line-clamp-2 pr-4 text-xs font-medium leading-snug">{file.name}</span>
                  {file.sizeBytes ? <span className="mt-1 text-[11px] text-muted-foreground">{prettyBytes(file.sizeBytes)}</span> : null}
                  <span className="mt-auto flex items-center gap-1 pt-2">
                    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      {artifactLabel(file)}
                    </span>
                    {local && file.keepOnDevice && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Never leaves this computer" />}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 data-[state=open]:opacity-100" aria-label={`${file.name} actions`}>
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {local && (
                        <DropdownMenuCheckboxItem
                          checked={Boolean(file.keepOnDevice)}
                          onCheckedChange={(checked) => void toggleKeepOnDevice(file.itemId, checked === true)}
                        >
                          Never send to Cloud
                        </DropdownMenuCheckboxItem>
                      )}
                      <DropdownMenuItem onSelect={() => void onChange({ libraryItemIds: project.libraryItemIds.filter((id) => id !== file.itemId) })}>
                        <X className="mr-2 h-4 w-4" /> Remove from project
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PanelSection>
  );
}

function InstructionsDialog({ open, onOpenChange, value, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setDraft(value); }, [open, value]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Project instructions</DialogTitle>
          <DialogDescription>Every chat in this project follows these, in addition to the agent&apos;s own instructions.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="For example: Write for a client audience. Cite every claim with the source file and section."
          className="min-h-48 resize-y"
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSave(draft);
              setSaving(false);
              onOpenChange(false);
            }}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ open, onOpenChange, name, description, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  description: string;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  useEffect(() => {
    if (!open) return;
    setDraftName(name);
    setDraftDescription(description);
  }, [open, name, description]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-rename">Name</Label>
            <Input id="project-rename" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-description">What are you trying to achieve?</Label>
            <Textarea id="project-description" value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} className="min-h-24 resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!draftName.trim()}
            onClick={async () => {
              await onSave(draftName.trim(), draftDescription.trim());
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_SCHEDULE_PROMPT =
  "Update the project brief with anything new or changed in the project files and knowledge since the last brief. Keep what is still accurate, flag what changed, and cite every source.";

function nextMondayMorning() {
  const date = new Date();
  date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
  date.setHours(9, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function scheduleLabel(task: ProjectDetail["tasks"][number]) {
  const recurring = task.cronExpression;
  if (recurring === "weekly" || (recurring && /\s\d$/.test(recurring))) return "Weekly";
  if (recurring === "daily" || (recurring && /\*\s\*$/.test(recurring))) return "Daily";
  const when = task.scheduledFor ?? task.dueAt;
  return when ? relativeTime(when) : task.status;
}

function ScheduleDialog({ open, onOpenChange, project, agents, local, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetail;
  agents: Array<{ agentId: string; name: string; isDefault?: boolean }>;
  local: boolean;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("Weekly brief");
  const [prompt, setPrompt] = useState(DEFAULT_SCHEDULE_PROMPT);
  const [repeat, setRepeat] = useState<"once" | "daily" | "weekly">("weekly");
  const [start, setStart] = useState(nextMondayMorning());
  const [saving, setSaving] = useState(false);
  const agentId = project.agentId ?? agents.find((agent) => agent.isDefault)?.agentId ?? agents[0]?.agentId;

  useEffect(() => {
    if (!open) return;
    setTitle("Weekly brief");
    setPrompt(DEFAULT_SCHEDULE_PROMPT);
    setRepeat("weekly");
    setStart(nextMondayMorning());
  }, [open]);

  const create = async () => {
    if (!agentId) return;
    setSaving(true);
    try {
      const first = new Date(start);
      const sessionResponse = await desktopApiFetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, projectId: project.projectId, title }),
      });
      const sessionPayload = await sessionResponse.json().catch(() => ({}));
      const sessionId = sessionPayload?.data?.sessionId;
      if (!sessionResponse.ok || !sessionId) throw new Error(sessionPayload?.message || "Could not prepare the task chat");
      // Cloud schedules use UTC cron fields derived from the chosen local time.
      const cron = repeat === "weekly"
        ? `${first.getUTCMinutes()} ${first.getUTCHours()} * * ${first.getUTCDay()}`
        : repeat === "daily" ? `${first.getUTCMinutes()} ${first.getUTCHours()} * * *` : undefined;
      const response = await desktopApiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          sessionId,
          title: title.trim() || "Scheduled task",
          description: prompt.trim(),
          scheduledFor: first.toISOString(),
          ...(local
            ? { repeat: repeat === "once" ? undefined : repeat }
            : cron
              ? { cronExpression: cron, isRecurring: true, recurringSessionMode: "same" }
              : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || "Could not schedule the task");
      toast({ title: "Scheduled", description: `${title} runs ${repeat === "once" ? "once" : repeat}.` });
      onOpenChange(false);
      onCreated();
    } catch (cause) {
      toast({ title: "Could not schedule the task", description: cause instanceof Error ? cause.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Schedule work for this project</DialogTitle>
          <DialogDescription>It runs in a project chat, with the project&apos;s instructions and knowledge.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="schedule-title">Name</Label>
            <Input id="schedule-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule-prompt">What should the agent do?</Label>
            <Textarea id="schedule-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-24 resize-none" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Repeat</Label>
              <div className="flex rounded-lg bg-muted/70 p-0.5">
                {(["once", "daily", "weekly"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRepeat(value)}
                    className={cn("flex-1 rounded-md px-2 py-1.5 text-xs capitalize", repeat === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-start">{repeat === "once" ? "When" : "Starting"}</Label>
              <Input id="schedule-start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
            </div>
          </div>
          {local && <p className="text-xs text-muted-foreground">Local tasks run while Agent Commons is open on this computer.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void create()} disabled={saving || !agentId || !prompt.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
