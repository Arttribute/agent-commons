"use client";

import { WorkflowCard } from "./workflow-card";
import { Workflow as WorkflowIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useWorkflows } from "@/hooks/use-workflows";


interface WorkflowsListViewProps {
  userAddress: string;
}

export function WorkflowsListView({ userAddress }: WorkflowsListViewProps) {
  const { workflows, loading, refresh } = useWorkflows(userAddress, "user");
  const { toast } = useToast();

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

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <WorkflowIcon className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No workflows yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Create a workflow from scratch or start from a template
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {workflows.map((workflow: any) => (
        <WorkflowCard
          key={workflow.workflowId}
          workflow={workflow}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
        />
      ))}
    </div>
  );
}
