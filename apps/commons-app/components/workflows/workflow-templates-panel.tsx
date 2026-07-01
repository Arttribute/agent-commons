"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Boxes,
  Loader2,
  Network,
  PlayCircle,
  Workflow,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { ToolCatalogItem } from "@/lib/tools/catalog";

type WorkflowTemplateSummary = {
  name: string;
  description: string;
  category: string;
  tags: string[];
  sampleInput: Record<string, any>;
  toolCount: number;
  requiresAgent: boolean;
  supportsReviewerAgent: boolean;
  createsChildWorkflow: boolean;
};

type AgentOption = {
  agentId: string;
  name: string;
};

function templateLabel(template: WorkflowTemplateSummary) {
  switch (template.name) {
    case "country-weather-brief":
      return "Tool-Only Workflow";
    case "agent-research-summary":
      return "Agent Processor Workflow";
    case "multi-agent-field-report":
      return "Multi-Agent Workflow";
    case "workflow-invocation-smoke":
      return "Workflow Invocation";
    default:
      return template.name;
  }
}

function TemplateIcon({ template }: { template: WorkflowTemplateSummary }) {
  if (template.name === "multi-agent-field-report") {
    return <Network className="h-4 w-4 text-cyan-700" />;
  }
  if (template.requiresAgent) {
    return <Bot className="h-4 w-4 text-blue-700" />;
  }
  if (template.createsChildWorkflow) {
    return <Workflow className="h-4 w-4 text-indigo-700" />;
  }
  return <Wrench className="h-4 w-4 text-emerald-700" />;
}

export function WorkflowTemplatesPanel({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [catalogItems, setCatalogItems] = useState<ToolCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [primaryAgentId, setPrimaryAgentId] = useState("");
  const [reviewerAgentId, setReviewerAgentId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [templatesRes, catalogRes] = await Promise.all([
          fetch("/api/workflows/templates", { cache: "no-store" }),
          fetch("/api/tools/catalog", { cache: "no-store" }),
        ]);
        const templatesJson = await templatesRes.json().catch(() => ({ templates: [] }));
        const catalogJson = await catalogRes.json().catch(() => ({ items: [] }));
        if (cancelled) return;
        setTemplates(templatesJson.templates ?? []);
        setCatalogItems(catalogJson.items ?? []);
      } catch (error) {
        console.error("Failed to load workflow templates:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const agents = useMemo<AgentOption[]>(() => {
    return catalogItems
      .filter((item) => item.workflowNode?.nodeType === "agent_processor")
      .map((item) => ({
        agentId: item.workflowNode?.agentId ?? item.agent?.agentId ?? "",
        name: item.displayName,
      }))
      .filter((agent) => Boolean(agent.agentId));
  }, [catalogItems]);

  useEffect(() => {
    if (!primaryAgentId && agents[0]?.agentId) {
      setPrimaryAgentId(agents[0].agentId);
    }
    if (!reviewerAgentId && agents[1]?.agentId) {
      setReviewerAgentId(agents[1].agentId);
    }
  }, [agents, primaryAgentId, reviewerAgentId]);

  const handleCreate = async (template: WorkflowTemplateSummary) => {
    const agentId = template.requiresAgent ? primaryAgentId : undefined;
    if (template.requiresAgent && !agentId) {
      toast({
        title: "Agent required",
        description: "Select an agent before creating this workflow template.",
        variant: "destructive",
      });
      return;
    }

    setCreating(template.name);
    try {
      const response = await fetch("/api/workflows/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: template.name,
          agentId,
          reviewerAgentId: template.supportsReviewerAgent
            ? reviewerAgentId || agentId
            : undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || result.message || "Failed to create workflow template");
      }

      toast({ title: "Workflow template created" });
      onCreated?.();
      router.push(`/studio/workflows/${result.workflow.workflowId}/edit`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create workflow template",
        variant: "destructive",
      });
    } finally {
      setCreating(null);
    }
  };

  if (loading) {
    return (
      <section className="mb-5 rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex items-center gap-2">
          <Boxes className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Workflow templates</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (templates.length === 0) return null;

  return (
    <section className="mb-5 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Workflow templates</h2>
        </div>
        {agents.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[520px]">
            <Select value={primaryAgentId} onValueChange={setPrimaryAgentId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Primary agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.agentId} value={agent.agentId}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={reviewerAgentId || primaryAgentId} onValueChange={setReviewerAgentId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Reviewer agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.agentId} value={agent.agentId}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {templates.map((template) => {
          const agentBlocked = template.requiresAgent && agents.length === 0;
          const isCreating = creating === template.name;
          return (
            <div
              key={template.name}
              className="flex min-h-[132px] flex-col justify-between rounded-lg border border-border bg-muted/10 p-3"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-background p-2 shadow-sm">
                  <TemplateIcon template={template} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{templateLabel(template)}</p>
                    <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                      {template.toolCount} tools
                    </Badge>
                    {template.requiresAgent && (
                      <Badge variant="outline" className="h-5 px-2 text-[10px]">
                        agent
                      </Badge>
                    )}
                    {template.createsChildWorkflow && (
                      <Badge variant="outline" className="h-5 px-2 text-[10px]">
                        nested
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {template.description}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="truncate text-[11px] text-muted-foreground">
                  Sample input: {JSON.stringify(template.sampleInput)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCreate(template)}
                  disabled={Boolean(creating) || agentBlocked}
                  title={agentBlocked ? "Create an agent first" : undefined}
                  className="h-8 shrink-0"
                >
                  {isCreating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlayCircle className="h-3.5 w-3.5" />
                  )}
                  Create
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
