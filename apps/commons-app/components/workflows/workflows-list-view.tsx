"use client";

import { useMemo, useState } from "react";
import { WorkflowCard } from "./workflow-card";
import { Search, Workflow as WorkflowIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useWorkflows } from "@/hooks/use-workflows";


interface WorkflowsListViewProps {
  userAddress: string;
}

export function WorkflowsListView({ userAddress }: WorkflowsListViewProps) {
  const { workflows, loading, refresh } = useWorkflows(userAddress, "user");
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const visibleWorkflows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return workflows;
    return workflows.filter((workflow: any) =>
      [workflow.name, workflow.description]
        .filter(Boolean)
        .some((value: string) => value.toLowerCase().includes(query)),
    );
  }, [workflows, searchQuery]);

  const handleDelete = async (workflowId: string) => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;
    try {
      await fetch(`/api/workflows/${workflowId}`, { method: "DELETE" });
      toast({ title: "Workflow deleted" });
      refresh();
    } catch {
      toast({ title: "Error", description: "Failed to delete workflow", variant: "destructive" });
    }
  };

  const handleDuplicate = async (workflowId: string) => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}`);
      const json = await res.json();
      const workflow = json.data ?? json;
      await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${workflow.name} (Copy)`,
          description: workflow.description,
          ownerId: userAddress,
          ownerType: "user",
          definition: workflow.definition,
        }),
      });
      toast({ title: "Workflow duplicated" });
      refresh();
    } catch {
      toast({ title: "Error", description: "Failed to duplicate workflow", variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-5">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search workflows…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-9 bg-white pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : visibleWorkflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <WorkflowIcon className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {workflows.length === 0
              ? "No workflows yet"
              : "No workflows match your search"}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {workflows.length === 0
              ? "Create a workflow from scratch or start from a template"
              : "Try a different name or clear the search"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {visibleWorkflows.map((workflow: any) => (
            <WorkflowCard
              key={workflow.workflowId}
              workflow={workflow}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
