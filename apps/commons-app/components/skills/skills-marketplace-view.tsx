"use client";

import { useState, useEffect, useRef } from "react";
import {
  Loader2,
  Sparkles,
  Search,
  Trash2,
  Globe,
  Lock,
  Users,
  ArrowLeft,
  MessageCircle,
  ClipboardPenLine,
  FileUp,
  Video,
  ShieldAlert,
  Square,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useSkills } from "@/hooks/use-skills";
import { useAgents } from "@/hooks/use-agents";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { Skill } from "@agent-commons/sdk";

interface SkillsMarketplaceViewProps {
  userAddress: string;
  onRegisterCreate?: (fn: () => void) => void;
}

interface CreateSkillForm {
  slug: string;
  name: string;
  description: string;
  instructions: string;
  tools: string;
  triggers: string;
  tags: string;
  icon: string;
  isPublic: boolean;
}

const EMPTY_FORM: CreateSkillForm = {
  slug: "",
  name: "",
  description: "",
  instructions: "",
  tools: "",
  triggers: "",
  tags: "",
  icon: "",
  isPublic: false,
};

type CreateMode = "choose" | "manual" | "upload" | "record";

function CreateChoice({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 rounded-xl border p-4 text-left transition hover:border-foreground/20 hover:bg-muted/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

function SkillCard({
  skill,
  onDelete,
  onOpen,
  onManageAgents,
  isOwner,
}: {
  skill: Skill;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  onManageAgents: (skill: Skill) => void;
  isOwner: boolean;
}) {
  const VisibilityIcon = skill.isPublic ? Globe : Lock;
  const enabledAgents = (skill.assignedAgents ?? []).filter(
    (assignment) => assignment.isEnabled
  );

  return (
    <div
      className="group flex h-full cursor-pointer flex-col rounded-xl border border-border bg-background p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
      onClick={() => onOpen(skill.skillId)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-lg dark:bg-amber-300/15">
          {skill.icon || (
            <Sparkles
              className="h-4 w-4 text-amber-900 dark:text-amber-200"
              strokeWidth={1.9}
            />
          )}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <VisibilityIcon
            className="h-3.5 w-3.5 text-muted-foreground/60"
            aria-label={skill.isPublic ? "Public" : "Private"}
          />
          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(skill.skillId);
              }}
              aria-label="Delete skill"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <h3 className="mt-3 truncate text-sm font-semibold text-foreground">
        {skill.name}
      </h3>
      <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs leading-4 text-muted-foreground">
        {skill.description}
      </p>

      <Button
        variant="ghost"
        className="mt-3 h-8 justify-start gap-2 px-2 text-xs font-normal text-muted-foreground"
        onClick={(event) => {
          event.stopPropagation();
          onManageAgents(skill);
        }}
      >
        <Users className="h-3.5 w-3.5" />
        <span className="truncate">
          {enabledAgents.length
            ? `Available to ${enabledAgents
                .slice(0, 2)
                .map((assignment) => assignment.agentName)
                .join(", ")}${
                enabledAgents.length > 2 ? ` +${enabledAgents.length - 2}` : ""
              }`
            : "Not assigned to an agent"}
        </span>
      </Button>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <div className="flex min-w-0 flex-wrap gap-1">
          {skill.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="h-4 px-1.5 text-[10px] font-normal"
            >
              {tag}
            </Badge>
          ))}
          {skill.tags.length > 3 && (
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground"
            >
              +{skill.tags.length - 3}
            </Badge>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {skill.usageCount} uses
        </span>
      </div>
    </div>
  );
}

export function SkillsMarketplaceView({
  userAddress,
  onRegisterCreate,
}: SkillsMarketplaceViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"platform" | "mine">("platform");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("choose");
  const [skillFile, setSkillFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamsRef = useRef<MediaStream[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [updatingAgentId, setUpdatingAgentId] = useState<string | null>(null);

  // Allow parent to trigger create dialog via callback registration
  useEffect(() => {
    onRegisterCreate?.(() => {
      setCreateMode("choose");
      setShowCreate(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateSkillForm>(EMPTY_FORM);

  const { toast } = useToast();
  const { agents, loading: loadingAgents } = useAgents(
    userAddress || undefined
  );

  const platformFilter = { ownerType: "platform", isPublic: true };
  const myFilter = userAddress ? { ownerId: userAddress } : undefined;

  const {
    skills: platformSkills,
    loading: loadingPlatform,
    refresh: refreshPlatform,
  } = useSkills(platformFilter);

  const {
    skills: mySkills,
    loading: loadingMine,
    refresh: refreshMine,
  } = useSkills(myFilter);

  const activeSkills = tab === "platform" ? platformSkills : mySkills;
  const loading = tab === "platform" ? loadingPlatform : loadingMine;

  const filtered = search.trim()
    ? activeSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.description.toLowerCase().includes(search.toLowerCase()) ||
          s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : activeSkills;

  const handleDelete = async (skillId: string) => {
    if (!confirm("Delete this skill?")) return;
    try {
      await fetch(`/api/skills/${skillId}`, { method: "DELETE" });
      toast({ title: "Skill deleted" });
      refreshMine();
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete skill",
        variant: "destructive",
      });
    }
  };

  const handleCreate = async () => {
    if (!form.slug || !form.name || !form.description || !form.instructions) {
      toast({ title: "Required fields missing", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: form.slug,
          name: form.name,
          description: form.description,
          instructions: form.instructions,
          tools: form.tools
            ? form.tools
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          triggers: form.triggers
            ? form.triggers
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          tags: form.tags
            ? form.tags
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          icon: form.icon || undefined,
          isPublic: form.isPublic,
          ownerId: userAddress,
          ownerType: "user",
          source: "user",
        }),
      });
      toast({ title: "Skill created" });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      refreshMine();
      setTab("mine");
    } catch {
      toast({
        title: "Error",
        description: "Failed to create skill",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const openCopilotSkillCreator = () => {
    window.dispatchEvent(
      new CustomEvent("commons-copilot-prompt", {
        detail: {
          text: "Help me create a reusable skill. Ask me what outcome it should produce, when agents should invoke it, which tools it may use, and how its result should be validated. Then propose the skill for my review.",
        },
      })
    );
    setShowCreate(false);
  };

  const importSkill = async () => {
    if (!skillFile) return;
    setCreating(true);
    try {
      const body = new FormData();
      body.append("file", skillFile);
      const response = await fetch("/api/skills/import", {
        method: "POST",
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message || payload?.error || "Could not import skill"
        );
      }
      toast({
        title: "Skill imported",
        description: `${payload.data?.name ?? "Skill"} is ready.`,
      });
      setSkillFile(null);
      setShowCreate(false);
      setTab("mine");
      await refreshMine();
    } catch (error) {
      toast({
        title: "Could not import skill",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const startRecording = async () => {
    if (
      !navigator.mediaDevices?.getDisplayMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast({
        title: "Screen recording is unavailable",
        description: "Use a current Chrome, Edge, or Safari browser.",
        variant: "destructive",
      });
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const microphone = await navigator.mediaDevices
        .getUserMedia({ audio: true })
        .catch(() => null);
      recordingStreamsRef.current = microphone
        ? [screen, microphone]
        : [screen];
      const stream = new MediaStream([
        ...screen.getVideoTracks(),
        ...screen.getAudioTracks(),
        ...(microphone?.getAudioTracks() ?? []),
      ]);
      const mimeType = MediaRecorder.isTypeSupported(
        "video/webm;codecs=vp9,opus"
      )
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setRecordedBlob(new Blob(chunks, { type: mimeType }));
        setRecording(false);
        recordingStreamsRef.current.forEach((source) =>
          source.getTracks().forEach((track) => track.stop())
        );
        recordingStreamsRef.current = [];
      };
      screen.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state === "recording") recorder.stop();
      });
      recorderRef.current = recorder;
      setRecordedBlob(null);
      recorder.start(1_000);
      setRecording(true);
    } catch (error) {
      recordingStreamsRef.current.forEach((source) =>
        source.getTracks().forEach((track) => track.stop())
      );
      recordingStreamsRef.current = [];
      if ((error as DOMException)?.name !== "NotAllowedError") {
        toast({
          title: "Could not start recording",
          description:
            error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recordingStreamsRef.current.forEach((stream) =>
      stream.getTracks().forEach((track) => track.stop())
    );
  });

  const turnRecordingIntoSkill = async () => {
    if (!recordedBlob) return;
    setCreating(true);
    try {
      const copilotResponse = await fetch("/api/copilot", {
        cache: "no-store",
      });
      const copilotPayload = await copilotResponse.json().catch(() => null);
      if (!copilotResponse.ok || !copilotPayload?.data?.agentId) {
        throw new Error("Commons Copilot is not available for this account");
      }
      const body = new FormData();
      body.append(
        "files",
        new File([recordedBlob], `skill-recording-${Date.now()}.webm`, {
          type: recordedBlob.type || "video/webm",
        })
      );
      body.append("agentId", copilotPayload.data.agentId);
      const uploadResponse = await fetch("/api/files/upload", {
        method: "POST",
        body,
      });
      const uploadPayload = await uploadResponse.json().catch(() => null);
      if (!uploadResponse.ok || !uploadPayload?.data?.[0]?.fileId) {
        throw new Error(
          uploadPayload?.message ||
            uploadPayload?.error ||
            "Could not save recording"
        );
      }
      const artifact = uploadPayload.data[0];
      window.dispatchEvent(
        new CustomEvent("commons-copilot-prompt", {
          detail: {
            text: `Turn my screen recording into a reusable skill. The recording is the Library item ${artifact.fileId} (${artifact.name}). Read and analyze its indexed video description and transcript, infer the repeatable workflow, ask only for genuinely missing details, then propose a skill with triggers, required tools, step-by-step instructions, safety boundaries, and a validation checklist.`,
          },
        })
      );
      toast({
        title: "Recording ready",
        description: "Commons Copilot is turning it into a skill.",
      });
      setRecordedBlob(null);
      setShowCreate(false);
    } catch (error) {
      toast({
        title: "Could not process recording",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const setAgentAvailability = async (agentId: string, isEnabled: boolean) => {
    if (!selectedSkill) return;
    setUpdatingAgentId(agentId);
    try {
      const response = await fetch(
        `/api/skills/${encodeURIComponent(
          selectedSkill.skillId
        )}/agents/${encodeURIComponent(agentId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isEnabled }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message || payload?.error || "Could not update this agent"
        );
      }
      const agent = agents.find((candidate) => candidate.agentId === agentId);
      setSelectedSkill((current) => {
        if (!current || !agent) return current;
        const remaining = (current.assignedAgents ?? []).filter(
          (assignment) => assignment.agentId !== agentId
        );
        return {
          ...current,
          assignedAgents: [
            ...remaining,
            {
              assignmentId:
                payload?.data?.id ?? `${current.skillId}:${agentId}`,
              agentId,
              agentName: agent.name,
              agentAvatar: agent.avatar,
              isDefault: Boolean(agent.isDefault),
              isEnabled,
            },
          ],
        };
      });
      await Promise.all([refreshPlatform(), refreshMine()]);
    } catch (error) {
      toast({
        title: "Could not update skill access",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpdatingAgentId(null);
    }
  };

  return (
    <div>
      {/* Toolbar — creating a skill lives in the page header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="Search skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "platform" | "mine")}
        >
          <TabsList className="h-9">
            <TabsTrigger value="platform" className="text-xs">
              Platform
            </TabsTrigger>
            <TabsTrigger value="mine" className="text-xs">
              My skills
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {search
              ? "No skills match your search"
              : tab === "mine"
              ? "No skills yet"
              : "No platform skills"}
          </p>
          {!search && tab === "mine" && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              Create your first skill to add custom capabilities to your agents
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((skill) => (
            <SkillCard
              key={skill.skillId}
              skill={skill}
              onDelete={handleDelete}
              onOpen={(id) => router.push(`/studio/skills/${id}`)}
              onManageAgents={setSelectedSkill}
              isOwner={skill.ownerId === userAddress}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open && recording) stopRecording();
          setShowCreate(open);
          if (open) setCreateMode("choose");
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {createMode !== "choose" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCreateMode("choose")}
                  disabled={recording || creating}
                  aria-label="Back to creation options"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {createMode === "manual"
                ? "Write skill instructions"
                : createMode === "upload"
                ? "Upload a skill"
                : createMode === "record"
                ? "Record a skill"
                : "Create a skill"}
            </DialogTitle>
          </DialogHeader>

          {createMode === "choose" && (
            <div className="grid gap-2 py-2">
              <CreateChoice
                icon={<MessageCircle className="h-5 w-5" />}
                title="Create with Commons Copilot"
                description="Describe the outcome; Copilot will shape and propose the skill."
                onClick={openCopilotSkillCreator}
              />
              <CreateChoice
                icon={<ClipboardPenLine className="h-5 w-5" />}
                title="Write skill instructions"
                description="Create the name, triggers, tools, and Markdown playbook yourself."
                onClick={() => setCreateMode("manual")}
              />
              <CreateChoice
                icon={<FileUp className="h-5 w-5" />}
                title="Upload a skill"
                description="Import a SKILL.md, .zip, or portable .skill package."
                onClick={() => setCreateMode("upload")}
              />
              <CreateChoice
                icon={<Video className="h-5 w-5" />}
                title="Record your work"
                description="Record your screen and voice; Copilot turns the workflow into a skill."
                onClick={() => setCreateMode("record")}
              />
            </div>
          )}

          {createMode === "manual" && (
            <>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Skill ID *</Label>
                    <Input
                      className="h-9 font-mono text-xs"
                      placeholder="weekly-status-report"
                      value={form.slug}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          slug: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Icon</Label>
                    <Input
                      className="h-9 text-xs"
                      placeholder="✨"
                      value={form.icon}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          icon: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Name *</Label>
                  <Input
                    placeholder="Weekly status report"
                    value={form.name}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        name: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description *</Label>
                  <Textarea
                    className="min-h-20 resize-y text-sm"
                    placeholder="What the skill does and when an agent should invoke it."
                    value={form.description}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Instructions * (Markdown)</Label>
                  <Textarea
                    className="min-h-48 resize-y font-mono text-xs"
                    placeholder="## Workflow\n\n1. Gather recent work...\n\n## Validation"
                    value={form.instructions}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        instructions: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tools</Label>
                  <Input
                    placeholder="web_search, fetch_url"
                    value={form.tools}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        tools: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Trigger phrases</Label>
                  <Input
                    placeholder="weekly update, progress report"
                    value={form.triggers}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        triggers: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tags</Label>
                  <Input
                    placeholder="reporting, writing"
                    value={form.tags}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        tags: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="public-toggle"
                    checked={form.isPublic}
                    onCheckedChange={(value) =>
                      setForm((current) => ({ ...current, isPublic: value }))
                    }
                  />
                  <Label
                    htmlFor="public-toggle"
                    className="cursor-pointer text-xs"
                  >
                    Make publicly discoverable
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create skill
                </Button>
              </DialogFooter>
            </>
          )}

          {createMode === "upload" && (
            <>
              <p className="text-sm text-muted-foreground">
                Packages are validated before import. Archive paths stay inside
                the package and a SKILL.md file is required.
              </p>
              <label className="my-3 flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center transition hover:bg-muted/40">
                <FileUp className="mb-3 h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {skillFile?.name ?? "Drop a skill package or choose a file"}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  .md, .zip, or .skill · up to 10 MB
                </span>
                <input
                  type="file"
                  className="sr-only"
                  accept=".md,.zip,.skill,text/markdown,application/zip"
                  onChange={(event) =>
                    setSkillFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button onClick={importSkill} disabled={!skillFile || creating}>
                  {creating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Import skill
                </Button>
              </DialogFooter>
            </>
          )}

          {createMode === "record" && (
            <>
              <p className="text-sm text-muted-foreground">
                Your screen, clicks, typing, system audio, and—with
                permission—your voice are recorded. Video understanding extracts
                the repeatable workflow for Commons Copilot.
              </p>
              <div className="my-3 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <p>
                  Hide passwords, secrets, private conversations, and sensitive
                  customer data.
                </p>
              </div>
              <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border bg-muted/20 p-6 text-center">
                {recording ? (
                  <>
                    <span className="mb-3 h-3 w-3 animate-pulse rounded-full bg-red-500" />
                    <p className="font-medium">Recording your workflow…</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Perform the task naturally and explain important choices
                      aloud.
                    </p>
                  </>
                ) : recordedBlob ? (
                  <>
                    <Video className="mb-3 h-8 w-8 text-emerald-600" />
                    <p className="font-medium">Recording captured</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {(recordedBlob.size / (1024 * 1024)).toFixed(1)} MB ready
                      for analysis
                    </p>
                  </>
                ) : (
                  <>
                    <Video className="mb-3 h-8 w-8 text-muted-foreground" />
                    <p className="font-medium">Show how the work is done</p>
                    <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                      You choose the window or screen. Browser permissions
                      remain in your control.
                    </p>
                  </>
                )}
              </div>
              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowCreate(false)}
                  disabled={recording}
                >
                  Cancel
                </Button>
                {recording ? (
                  <Button variant="destructive" onClick={stopRecording}>
                    <Square className="mr-2 h-3.5 w-3.5 fill-current" />
                    Stop recording
                  </Button>
                ) : recordedBlob ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={startRecording}
                      disabled={creating}
                    >
                      Record again
                    </Button>
                    <Button
                      onClick={turnRecordingIntoSkill}
                      disabled={creating}
                    >
                      {creating && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Turn into skill
                    </Button>
                  </>
                ) : (
                  <Button onClick={startRecording}>Start recording</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedSkill)}
        onOpenChange={(open) => !open && setSelectedSkill(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agents with {selectedSkill?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Choose which agents can discover and invoke this skill. Commons
            Copilot skills can be shared with any of your other agents.
          </p>
          <div className="max-h-[55vh] divide-y overflow-y-auto rounded-xl border">
            {loadingAgents ? (
              <div className="flex h-28 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : agents.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                Create an agent to assign this skill.
              </p>
            ) : (
              agents.map((agent) => {
                const enabled = Boolean(
                  selectedSkill?.assignedAgents?.find(
                    (assignment) => assignment.agentId === agent.agentId
                  )?.isEnabled
                );
                return (
                  <div
                    key={agent.agentId}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {agent.name}
                        </p>
                        {agent.isDefault && (
                          <Badge variant="secondary">Commons Copilot</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {enabled
                          ? "Available to this agent"
                          : "Not available to this agent"}
                      </p>
                    </div>
                    {updatingAgentId === agent.agentId ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) =>
                          void setAgentAvailability(agent.agentId, checked)
                        }
                        aria-label={`Make ${
                          selectedSkill?.name ?? "skill"
                        } available to ${agent.name}`}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
