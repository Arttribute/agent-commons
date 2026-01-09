"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Plus, Calendar, CheckCircle2, Circle, XCircle, Clock, Play, Trash2, MoreVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateTaskDialog } from "./create-task-dialog";

interface Task {
  taskId: string;
  title: string;
  description?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  priority: number;
  progress: number;
  agentId: string;
  sessionId: string;
  executionMode?: "single" | "workflow" | "sequential";
  isRecurring?: boolean;
  cronExpression?: string;
  tools?: string[];
  toolConstraintType?: "hard" | "soft" | "none";
  toolInstructions?: string;
  dependsOn?: string[];
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

const statusColors = {
  pending: "bg-gray-200 text-gray-700",
  running: "bg-blue-200 text-blue-700",
  completed: "bg-green-200 text-green-700",
  failed: "bg-red-200 text-red-700",
  cancelled: "bg-orange-200 text-orange-700",
};

const statusIcons = {
  pending: Circle,
  running: Clock,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: XCircle,
};

export function TaskManagementView({ userAddress }: { userAddress: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    fetchAgents();
    fetchTasks();
  }, [userAddress, selectedAgent, filterStatus]);

  const fetchAgents = async () => {
    try {
      const response = await fetch(`/api/agents?owner=${userAddress}`);
      if (!response.ok) {
        console.error("Failed to fetch agents:", response.statusText);
        return;
      }
      const data = await response.json();
      setAgents(data.data || []);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    }
  };

  const fetchTasks = async () => {
    if (!userAddress) return;

    setLoading(true);
    try {
      // Fetch tasks by owner
      const response = await fetch(
        `/api/v1/tasks?ownerId=${userAddress}&ownerType=user`
      );
      if (!response.ok) {
        console.error("Failed to fetch tasks:", response.statusText);
        setTasks([]);
        return;
      }
      const data = await response.json();
      let fetchedTasks = data.data || [];

      // Apply filters
      if (selectedAgent !== "all") {
        fetchedTasks = fetchedTasks.filter((t: Task) => t.agentId === selectedAgent);
      }
      if (filterStatus !== "all") {
        fetchedTasks = fetchedTasks.filter((t: Task) => t.status === filterStatus);
      }

      setTasks(fetchedTasks);
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteTask = async (taskId: string) => {
    try {
      await fetch(`/api/v1/tasks/${taskId}/execute`, { method: "POST" });
      fetchTasks(); // Refresh list
    } catch (error) {
      console.error("Failed to execute task:", error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
      await fetch(`/api/v1/tasks/${taskId}`, { method: "DELETE" });
      fetchTasks(); // Refresh list
    } catch (error) {
      console.error("Failed to delete task:", error);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      await fetch(`/api/v1/tasks/${taskId}/cancel`, { method: "POST" });
      fetchTasks(); // Refresh list
    } catch (error) {
      console.error("Failed to cancel task:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Filter by Status
            </label>
            <Tabs value={filterStatus} onValueChange={setFilterStatus}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="running">Running</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="failed">Failed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Filter by Agent
            </label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
            >
              <option value="all">All Agents</option>
              {agents.map((agent) => (
                <option key={agent.agentId} value={agent.agentId}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button
          onClick={() => setShowCreateDialog(true)}
          size="sm"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Task
        </Button>
      </div>

      {/* Tasks Grid */}
      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              No tasks found
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Get started by creating your first task
            </p>
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create Task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => {
            const StatusIcon = statusIcons[task.status];
            const agentName =
              agents.find((a) => a.agentId === task.agentId)?.name || "Unknown Agent";

            return (
              <Card key={task.taskId} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base font-semibold line-clamp-1">
                        {task.title}
                      </CardTitle>
                      <p className="text-xs text-gray-500 mt-1">{agentName}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {task.status === "pending" && (
                          <DropdownMenuItem
                            onClick={() => handleExecuteTask(task.taskId)}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Execute
                          </DropdownMenuItem>
                        )}
                        {task.status === "running" && (
                          <DropdownMenuItem
                            onClick={() => handleCancelTask(task.taskId)}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancel
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleDeleteTask(task.taskId)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {task.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {task.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={statusColors[task.status]}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {task.status}
                    </Badge>
                    {task.isRecurring && (
                      <Badge variant="outline" className="text-xs">
                        Recurring
                      </Badge>
                    )}
                    {task.executionMode === "workflow" && (
                      <Badge variant="outline" className="text-xs">
                        Workflow
                      </Badge>
                    )}
                    {task.priority > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Priority: {task.priority}
                      </Badge>
                    )}
                  </div>

                  {task.toolConstraintType && task.toolConstraintType !== "none" && (
                    <div className="text-xs text-gray-500">
                      <span className="font-medium">Tools:</span> {task.toolConstraintType} constraint
                      {task.tools && ` (${task.tools.length})`}
                    </div>
                  )}

                  {task.dependsOn && task.dependsOn.length > 0 && (
                    <div className="text-xs text-gray-500">
                      Depends on {task.dependsOn.length} task(s)
                    </div>
                  )}

                  <div className="text-xs text-gray-400">
                    Created {new Date(task.createdAt).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Task Dialog */}
      <CreateTaskDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        userAddress={userAddress}
        onTaskCreated={fetchTasks}
      />
    </div>
  );
}
