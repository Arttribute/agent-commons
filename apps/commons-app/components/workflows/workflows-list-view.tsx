"use client";

import { useEffect, useState } from "react";
import { Workflow } from "@/types/workflow";
import { WorkflowCard } from "./workflow-card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WorkflowsListViewProps {
  userAddress: string;
}

export function WorkflowsListView({ userAddress }: WorkflowsListViewProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadWorkflows();
  }, [userAddress]);

  const loadWorkflows = async () => {
    if (!userAddress) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/workflows?ownerId=${userAddress}&ownerType=user`
      );
      const data = await res.json();

      if (data.success || data.data) {
        setWorkflows(data.data || []);
      }
    } catch (error) {
      console.error("Failed to load workflows:", error);
      toast({
        title: "Error",
        description: "Failed to load workflows",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (workflowId: string) => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;

    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast({
          title: "Success",
          description: "Workflow deleted successfully",
        });
        loadWorkflows();
      } else {
        throw new Error("Failed to delete workflow");
      }
    } catch (error) {
      console.error("Failed to delete workflow:", error);
      toast({
        title: "Error",
        description: "Failed to delete workflow",
        variant: "destructive",
      });
    }
  };

  const handleDuplicate = async (workflowId: string) => {
    try {
      // Fetch the workflow details
      const res = await fetch(`/api/workflows/${workflowId}`);
      const data = await res.json();

      if (!data.success) {
        throw new Error("Failed to fetch workflow");
      }

      const workflow = data.data;

      // Create a new workflow with copied data
      const createRes = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${workflow.name} (Copy)`,
          description: workflow.description,
          ownerId: userAddress,
          ownerType: "user",
          nodes: workflow.nodes,
          edges: workflow.edges,
        }),
      });

      if (createRes.ok) {
        toast({
          title: "Success",
          description: "Workflow duplicated successfully",
        });
        loadWorkflows();
      } else {
        throw new Error("Failed to duplicate workflow");
      }
    } catch (error) {
      console.error("Failed to duplicate workflow:", error);
      toast({
        title: "Error",
        description: "Failed to duplicate workflow",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-2">No workflows yet</p>
        <p className="text-sm text-gray-400">
          Create your first workflow to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {workflows.map((workflow) => (
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
