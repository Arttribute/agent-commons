"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Bot,
  Boxes,
  ChevronRight,
  Loader2,
  Network,
  PenLine,
  Workflow as WorkflowIcon,
  Wrench,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ToolCatalogItem } from "@/lib/tools/catalog";

interface CreateWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  userAddress: string;
}

type Mode = "choose" | "scratch" | "templates";

type WorkflowTemplateSummary = {
  name: string;
  description: string;
  category: string;
  tags: string[];
  toolCount: number;
  requiresAgent: boolean;
  supportsReviewerAgent: boolean;
  createsChildWorkflow: boolean;
};

type AgentOption = { agentId: string; name: string };

const TEMPLATE_META: Record<
  string,
  { label: string; icon: typeof Wrench; chip: string }
> = {
  "country-weather-brief": {
    label: "Tool-only workflow",
    icon: Wrench,
    chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-300/15 dark:text-emerald-200",
  },
  "agent-research-summary": {
    label: "Agent workflow",
    icon: Bot,
    chip: "bg-cyan-100 text-cyan-900 dark:bg-cyan-300/15 dark:text-cyan-200",
  },
  "multi-agent-field-report": {
    label: "Multi-agent workflow",
    icon: Network,
    chip: "bg-pink-100 text-pink-900 dark:bg-pink-300/15 dark:text-pink-200",
  },
  "workflow-invocation-smoke": {
    label: "Nested workflow",
    icon: WorkflowIcon,
    chip: "bg-indigo-100 text-indigo-900 dark:bg-indigo-300/15 dark:text-indigo-200",
  },
};

function templateMeta(template: WorkflowTemplateSummary) {
  return (
    TEMPLATE_META[template.name] ?? {
      label: template.name,
      icon: WorkflowIcon,
      chip: "bg-muted text-foreground",
    }
  );
}

export function CreateWorkflowDialog({
  open,
  onClose,
  userAddress,
}: CreateWorkflowDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("choose");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "" });

  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentId, setAgentId] = useState("");

  useEffect(() => {
    if (!open) {
      setMode("choose");
      setSelectedTemplate(null);
      return;
    }
  }, [open]);

  // Load templates + agents lazily, the first time the template path opens
  useEffect(() => {
    if (mode !== "templates" || templates.length > 0 || templatesLoading) return;
    let cancelled = false;
    setTemplatesLoading(true);
    (async () => {
      try {
        const [templatesRes, catalogRes] = await Promise.all([
          fetch("/api/workflows/templates", { cache: "no-store" }),
          fetch("/api/tools/catalog", { cache: "no-store" }),
        ]);
        const templatesJson = await templatesRes.json().catch(() => ({ templates: [] }));
        const catalogJson = await catalogRes.json().catch(() => ({ items: [] }));
        if (cancelled) return;
        setTemplates(templatesJson.templates ?? []);
        const agentOptions = ((catalogJson.items ?? []) as ToolCatalogItem[])
          .filter((item) => item.workflowNode?.nodeType === "agent_processor")
          .map((item) => ({
            agentId: item.workflowNode?.agentId ?? item.agent?.agentId ?? "",
            name: item.displayName,
          }))
          .filter((agent) => Boolean(agent.agentId));
        setAgents(agentOptions);
        if (agentOptions[0]) setAgentId(agentOptions[0].agentId);
      } catch (error) {
        console.error("Failed to load workflow templates:", error);
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, templates.length, templatesLoading]);

  const activeTemplate = useMemo(
    () => templates.find((template) => template.name === selectedTemplate) ?? null,
    [templates, selectedTemplate]
  );

  const handleCreateBlank = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Name required",
        description: "Give the workflow a name first.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          ownerId: userAddress,
          ownerType: "user",
          definition: { nodes: [], edges: [] },
        }),
      });
      const workflow = await res.json();
      if (!res.ok) throw new Error(workflow.message || "Failed to create workflow");

      router.push(`/studio/workflows/${workflow.workflowId}/edit`);
      setFormData({ name: "", description: "" });
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to create workflow", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFromTemplate = async () => {
    if (!activeTemplate) return;
    if (activeTemplate.requiresAgent && !agentId) {
      toast({
        title: "Agent required",
        description: "This template needs an agent. Create one first.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/workflows/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: activeTemplate.name,
          agentId: activeTemplate.requiresAgent ? agentId : undefined,
          reviewerAgentId: activeTemplate.supportsReviewerAgent ? agentId : undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || result.message || "Failed to create workflow");
      }
      router.push(`/studio/workflows/${result.workflow.workflowId}/edit`);
      onClose();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create workflow from template",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {mode !== "choose" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-lg"
                onClick={() => setMode("choose")}
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <DialogTitle>
                {mode === "scratch"
                  ? "New workflow"
                  : mode === "templates"
                    ? "Start from a template"
                    : "Create workflow"}
              </DialogTitle>
              <DialogDescription>
                {mode === "choose"
                  ? "Automate multi-step work with your tools and agents."
                  : mode === "scratch"
                    ? "Name it, then build on the canvas."
                    : "Pick a starting point — you can change everything after."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {mode === "choose" && (
          <div className="space-y-2 py-2">
            <button
              type="button"
              onClick={() => setMode("scratch")}
              className="group flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-900 dark:bg-blue-300/15 dark:text-blue-200">
                <PenLine className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Start from scratch</span>
                <span className="block text-xs text-muted-foreground">
                  A blank canvas to design your own flow
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
            </button>

            <button
              type="button"
              onClick={() => setMode("templates")}
              className="group flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-900 dark:bg-violet-300/15 dark:text-violet-200">
                <Boxes className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Use a template</span>
                <span className="block text-xs text-muted-foreground">
                  Ready-made flows you can customize
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
            </button>
          </div>
        )}

        {mode === "scratch" && (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My workflow"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What does this workflow do?"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleCreateBlank} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </>
        )}

        {mode === "templates" && (
          <>
            <div className="space-y-1.5 py-2">
              {templatesLoading ? (
                [...Array(4)].map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-xl" />
                ))
              ) : templates.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No templates available
                </p>
              ) : (
                templates.map((template) => {
                  const meta = templateMeta(template);
                  const selected = selectedTemplate === template.name;
                  return (
                    <button
                      key={template.name}
                      type="button"
                      onClick={() => setSelectedTemplate(template.name)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                        selected
                          ? "border-foreground/60 bg-muted/50"
                          : "border-border hover:bg-muted/40"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          meta.chip
                        )}
                      >
                        <meta.icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{meta.label}</span>
                          <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
                            {template.toolCount} tools
                          </Badge>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {template.description}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {activeTemplate?.requiresAgent && (
              <div className="space-y-1.5">
                <Label className="text-xs">Agent to run this workflow</Label>
                {agents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    You need an agent for this template — create one first.
                  </p>
                ) : (
                  <Select value={agentId} onValueChange={setAgentId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Choose an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.agentId} value={agent.agentId}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateFromTemplate}
                disabled={
                  loading ||
                  !activeTemplate ||
                  (activeTemplate.requiresAgent && agents.length === 0)
                }
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
