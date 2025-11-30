"use client";

import { Workflow } from "@/types/workflow";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical, Edit, Copy, Trash2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

interface WorkflowCardProps {
  workflow: Workflow;
  onDelete?: (workflowId: string) => void;
  onDuplicate?: (workflowId: string) => void;
}

export function WorkflowCard({
  workflow,
  onDelete,
  onDuplicate,
}: WorkflowCardProps) {
  const router = useRouter();

  const handleEdit = () => {
    router.push(`/studio/workflows/${workflow.workflowId}/edit`);
  };

  return (
    <Card
      className="p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={handleEdit}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-lg">{workflow.name}</h3>
            <Badge variant={workflow.isActive ? "default" : "secondary"}>
              {workflow.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>

          {workflow.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {workflow.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>
              Updated{" "}
              {formatDistanceToNow(new Date(workflow.updatedAt), {
                addSuffix: true,
              })}
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate?.(workflow.workflowId);
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(workflow.workflowId);
              }}
              className="text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
