"use client";

import { useState, useMemo, useCallback } from "react";
import { Loader2, Plus, Calendar, CheckCircle2, Circle, XCircle, Clock, Play, Trash2, MoreVertical, RefreshCw, LayoutGrid, GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateTaskDialog } from "./create-task-dialog";
import { useTasks } from "@/hooks/use-tasks";
import { useAgents } from "@/hooks/use-agents";
import type { Task } from "@agent-commons/sdk";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  type NodeProps,
  type Node,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";

const statusColors: Record<Task["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-orange-100 text-orange-700",
};

const statusIcons: Record<Task["status"], React.ElementType> = {
  pending: Circle,
  running: Clock,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: XCircle,
};

// ── Dependency graph ─────────────────────────────────────────────────────────

const statusNodeColors: Record<Task["status"], string> = {
  pending:   "border-muted-foreground/40 bg-muted/30",
  running:   "border-blue-400 bg-blue-50",
  completed: "border-green-500 bg-green-50",
  failed:    "border-red-400 bg-red-50",
  cancelled: "border-orange-400 bg-orange-50",
};

function TaskNode({ data }: NodeProps) {
  const { task, agentName } = data as { task: Task; agentName: string };
  const StatusIcon = statusIcons[task.status];
  return (
    <div className={`rounded-lg border-2 px-3 py-2 text-xs w-44 shadow-sm ${statusNodeColors[task.status]}`}>
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="flex items-center gap-1.5 mb-0.5">
        <StatusIcon className="h-3 w-3 shrink-0" />
        <span className="font-semibold truncate">{task.title}</span>
      </div>
      <span className="text-muted-foreground truncate block">{agentName}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  );
}

const nodeTypes = { task: TaskNode };

function TaskDependencyGraph({ tasks, agentMap }: { tasks: Task[]; agentMap: Map<string, string> }) {
  // Layout: topological levels with simple column placement
  const { nodes, edges } = useMemo(() => {
    const depMap = new Map<string, string[]>();
    for (const t of tasks) depMap.set(t.taskId, (t as any).dependsOn ?? []);

    // Kahn's algorithm to assign levels
    const inDegree = new Map<string, number>();
    for (const t of tasks) inDegree.set(t.taskId, 0);
    for (const [id, deps] of depMap)
      for (const dep of deps)
        if (inDegree.has(dep)) inDegree.set(id, (inDegree.get(id) ?? 0) + 1);

    const levels = new Map<string, number>();
    const queue = tasks.filter((t) => (inDegree.get(t.taskId) ?? 0) === 0).map((t) => t.taskId);
    for (const id of queue) levels.set(id, 0);

    while (queue.length) {
      const id = queue.shift()!;
      const level = levels.get(id) ?? 0;
      for (const [child, deps] of depMap) {
        if (deps.includes(id)) {
          const newLevel = Math.max(levels.get(child) ?? 0, level + 1);
          levels.set(child, newLevel);
          inDegree.set(child, (inDegree.get(child) ?? 1) - 1);
          if ((inDegree.get(child) ?? 0) <= 0) queue.push(child);
        }
      }
    }

    // Group by level to compute x positions
    const byLevel = new Map<number, string[]>();
    for (const [id, level] of levels) {
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level)!.push(id);
    }

    const HGAP = 200, VGAP = 120;
    const nodes: Node[] = tasks.map((t) => {
      const level = levels.get(t.taskId) ?? 0;
      const peers = byLevel.get(level) ?? [];
      const col = peers.indexOf(t.taskId);
      const totalW = peers.length * HGAP;
      return {
        id: t.taskId,
        type: "task",
        position: { x: col * HGAP - totalW / 2 + 400, y: level * VGAP + 20 },
        data: { task: t, agentName: agentMap.get(t.agentId) ?? "Unknown" },
      };
    });

    const edges: Edge[] = [];
    for (const [id, deps] of depMap)
      for (const dep of deps)
        if (levels.has(dep))
          edges.push({ id: `${dep}-${id}`, source: dep, target: id, animated: false, style: { stroke: "hsl(var(--border))" } });

    return { nodes, edges };
  }, [tasks, agentMap]);

  return (
    <div className="h-[520px] rounded-lg border border-border overflow-hidden">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }}>
        <Background gap={16} color="hsl(var(--muted-foreground)/0.1)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function TaskManagementView({ userAddress }: { userAddress: string }) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "graph">("grid");

  const { agents } = useAgents(userAddress);
  const { tasks, loading, refresh } = useTasks({ ownerId: userAddress, ownerType: "user" });

  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.agentId, a.name])),
    [agents],
  );

  const filteredTasks = tasks.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (selectedAgent !== "all" && t.agentId !== selectedAgent) return false;
    return true;
  });

  const handleExecute = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await fetch(`/api/tasks/${taskId}/execute`, { method: "POST" });
      refresh();
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await fetch(`/api/tasks/${taskId}/cancel`, { method: "POST" });
      refresh();
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm("Delete this task?")) return;
    setActionLoading(taskId);
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      refresh();
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={filterStatus} onValueChange={setFilterStatus}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="running">Running</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="failed">Failed</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.agentId} value={a.agentId}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex border border-border rounded-md overflow-hidden">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 rounded-none px-2.5"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "graph" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 rounded-none px-2.5"
              onClick={() => setViewMode("graph")}
            >
              <GitBranch className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Create Task
          </Button>
        </div>
      </div>

      {/* Graph view */}
      {viewMode === "graph" && (
        filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-dashed text-center">
            <GitBranch className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No tasks to visualize</p>
          </div>
        ) : (
          <TaskDependencyGraph tasks={filteredTasks} agentMap={agentMap} />
        )
      )}

      {/* Tasks Grid */}
      {viewMode === "grid" && filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold mb-1">No tasks found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {filterStatus !== "all" || selectedAgent !== "all"
                ? "Try adjusting your filters"
                : "Create your first task to get started"}
            </p>
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Task
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((task) => {
            const StatusIcon = statusIcons[task.status];
            const agentName = agents.find((a) => a.agentId === task.agentId)?.name ?? "Unknown";
            const isActing = actionLoading === task.taskId;

            return (
              <Card key={task.taskId} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-semibold line-clamp-1">
                        {task.title}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{agentName}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" disabled={isActing}>
                          {isActing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <MoreVertical className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {task.status === "pending" && (
                          <DropdownMenuItem onClick={() => handleExecute(task.taskId)}>
                            <Play className="h-4 w-4 mr-2" />
                            Execute
                          </DropdownMenuItem>
                        )}
                        {task.status === "running" && (
                          <DropdownMenuItem onClick={() => handleCancel(task.taskId)}>
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancel
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleDelete(task.taskId)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2">
                  {task.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={`text-xs ${statusColors[task.status]}`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {task.status}
                    </Badge>
                    {task.isRecurring && (
                      <Badge variant="outline" className="text-xs">Recurring</Badge>
                    )}
                    {task.executionMode === "workflow" && (
                      <Badge variant="outline" className="text-xs">Workflow</Badge>
                    )}
                    {(task.priority ?? 0) > 0 && (
                      <Badge variant="outline" className="text-xs">P{task.priority}</Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      <CreateTaskDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        userAddress={userAddress}
        onTaskCreated={refresh}
      />
    </div>
  );
}
