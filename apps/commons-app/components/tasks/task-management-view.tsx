"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Calendar,
  Check,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  Minus,
  MoreHorizontal,
  Play,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateTaskDialog } from "./create-task-dialog";
import { TaskCalendarView } from "./calendar/task-calendar-view";
import { statusConfig, statusOrder } from "./status-config";
import { useAgents } from "@/hooks/use-agents";
import { useTasks } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";
import type { Task } from "@agent-commons/sdk";

type ViewMode = "list" | "board" | "calendar";
type StatusFilter = "all" | "active" | Task["status"];
type PriorityFilter = "all" | "none" | "high" | "medium" | "low";
type GroupBy = "status" | "agent" | "priority";
type Ordering = "priority" | "created" | "scheduled";

function priorityLabel(priority?: number | null) {
  if (!priority || priority <= 0) return "No priority";
  if (priority >= 3) return "High";
  if (priority === 2) return "Medium";
  return "Low";
}

function priorityFilterValue(priority?: number | null): PriorityFilter {
  if (!priority || priority <= 0) return "none";
  if (priority >= 3) return "high";
  if (priority === 2) return "medium";
  return "low";
}

function taskDate(task: Task) {
  const t = task as Task & { scheduledFor?: string; nextRunAt?: string };
  return t.scheduledFor || t.nextRunAt || task.createdAt;
}

function relativeDate(value?: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return formatDistanceToNow(date, { addSuffix: true });
}

/** Compact Linear-style date ("Sep 2"); full detail lives in the title attr */
function shortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "MMM d");
}

function StatusDot({ status }: { status: Task["status"] }) {
  const config = statusConfig[status] ?? statusConfig.pending;
  const Icon = config.icon;
  return <Icon className={cn("h-4 w-4 shrink-0", config.className)} />;
}

const PRIORITY_OPTIONS = [
  { key: "high", label: "High", value: 3 },
  { key: "medium", label: "Medium", value: 2 },
  { key: "low", label: "Low", value: 1 },
  { key: "none", label: "No priority", value: 0 },
] as const;

/**
 * Linear-style monochrome priority glyph: three bottom-aligned bars of
 * increasing height — low fills one, medium two, high all three. Unfilled
 * bars stay as faint placeholders; no priority renders a dash.
 */
function PriorityBars({
  level,
  className,
}: {
  level: number;
  className?: string;
}) {
  if (level <= 0) {
    return (
      <Minus className={cn("h-4 w-4 text-muted-foreground/60", className)} />
    );
  }
  const bars = [
    { x: 1.5, y: 9, height: 5 },
    { x: 6.5, y: 6, height: 8 },
    { x: 11.5, y: 3, height: 11 },
  ];
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {bars.map((bar, index) => (
        <rect
          key={index}
          x={bar.x}
          y={bar.y}
          width="3"
          height={bar.height}
          rx="1"
          className={
            index < level ? "fill-foreground" : "fill-muted-foreground/25"
          }
        />
      ))}
    </svg>
  );
}

/** Linear-style priority glyph; click to quick-edit */
function PriorityControl({
  priority,
  onChange,
}: {
  priority?: number | null;
  onChange: (priority: number) => void;
}) {
  const current =
    PRIORITY_OPTIONS.find((option) => option.key === priorityFilterValue(priority)) ??
    PRIORITY_OPTIONS[3];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted"
          title={`Priority: ${current.label}`}
          aria-label="Change priority"
        >
          <PriorityBars level={current.value} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {PRIORITY_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.key}
            onClick={(event) => {
              event.stopPropagation();
              onChange(option.value);
            }}
          >
            <PriorityBars level={option.value} />
            {option.label}
            {option.key === current.key && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskActions({
  task,
  isActing,
  onExecute,
  onCancel,
  onDelete,
}: {
  task: Task;
  isActing: boolean;
  onExecute: (taskId: string) => void;
  onCancel: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          {isActing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {task.status === "pending" && (
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onExecute(task.taskId);
            }}
          >
            <Play className="h-4 w-4" />
            Execute
          </DropdownMenuItem>
        )}
        {task.status === "running" && (
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation();
              onCancel(task.taskId);
            }}
          >
            <XCircle className="h-4 w-4" />
            Cancel
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(task.taskId);
          }}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskRow({
  task,
  agentName,
  isActing,
  onOpen,
  onExecute,
  onCancel,
  onDelete,
  onSetPriority,
}: {
  task: Task;
  agentName: string;
  isActing: boolean;
  onOpen: (taskId: string) => void;
  onExecute: (taskId: string) => void;
  onCancel: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onSetPriority: (taskId: string, priority: number) => void;
}) {
  const date = taskDate(task);
  return (
    <div
      role="button"
      tabIndex={0}
      className="group flex h-10 w-full cursor-pointer items-center gap-2.5 border-b border-border/50 px-4 text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
      onClick={() => onOpen(task.taskId)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(task.taskId);
      }}
    >
      <PriorityControl
        priority={task.priority}
        onChange={(priority) => onSetPriority(task.taskId, priority)}
      />
      <StatusDot status={task.status} />
      <span className="min-w-0 flex-1 truncate" title={task.description || task.title}>
        {task.title}
      </span>
      <span className="hidden shrink-0 items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground sm:flex">
        <Bot className="h-3 w-3" />
        <span className="max-w-[120px] truncate">{agentName}</span>
      </span>
      <span
        className="w-14 shrink-0 text-right text-xs text-muted-foreground"
        title={relativeDate(date)}
      >
        {shortDate(date)}
      </span>
      <TaskActions
        task={task}
        isActing={isActing}
        onExecute={onExecute}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    </div>
  );
}

function TaskBoardCard({
  task,
  agentName,
  isActing,
  onOpen,
  onExecute,
  onCancel,
  onDelete,
  onSetPriority,
}: {
  task: Task;
  agentName: string;
  isActing: boolean;
  onOpen: (taskId: string) => void;
  onExecute: (taskId: string) => void;
  onCancel: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onSetPriority: (taskId: string, priority: number) => void;
}) {
  const date = taskDate(task);
  return (
    <div
      className="group cursor-pointer rounded-xl border border-border bg-background p-3 transition-all hover:shadow-sm"
      onClick={() => onOpen(task.taskId)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-normal leading-5">{task.title}</h3>
        <TaskActions
          task={task}
          isActing={isActing}
          onExecute={onExecute}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <PriorityControl
          priority={task.priority}
          onChange={(priority) => onSetPriority(task.taskId, priority)}
        />
        <span className="flex min-w-0 items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
          <Bot className="h-3 w-3 shrink-0" />
          <span className="truncate">{agentName}</span>
        </span>
        <span
          className="ml-auto shrink-0 text-[11px] text-muted-foreground"
          title={relativeDate(date)}
        >
          {shortDate(date)}
        </span>
      </div>
    </div>
  );
}

export function TaskManagementView({
  userAddress,
  onRegisterCreate,
  agentId,
  hideAgentFilter = false,
  preSelectedAgentId,
}: {
  userAddress: string;
  onRegisterCreate?: (fn: () => void) => void;
  agentId?: string;
  hideAgentFilter?: boolean;
  preSelectedAgentId?: string;
}) {
  const router = useRouter();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createPrefillDate, setCreatePrefillDate] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [ordering, setOrdering] = useState<Ordering>("priority");
  const [showEmptyColumns, setShowEmptyColumns] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    onRegisterCreate?.(() => setShowCreateDialog(true));
  }, [onRegisterCreate]);

  const { agents } = useAgents(userAddress);
  const { tasks, loading, refresh, updateTask, rescheduleTask } = useTasks(
    agentId ? { agentId } : { ownerId: userAddress, ownerType: "user" }
  );

  const agentMap = useMemo(
    () => new Map(agents.map((agent) => [agent.agentId, agent.name])),
    [agents]
  );

  const agentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) counts.set(task.agentId, (counts.get(task.agentId) ?? 0) + 1);
    return counts;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (statusFilter === "active") {
          if (["completed", "failed", "cancelled"].includes(task.status)) return false;
        } else if (statusFilter !== "all" && task.status !== statusFilter) {
          return false;
        }
        if (!hideAgentFilter && selectedAgent !== "all" && task.agentId !== selectedAgent) return false;
        if (priorityFilter !== "all" && priorityFilterValue(task.priority) !== priorityFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (ordering === "created") {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (ordering === "scheduled") {
          return new Date(taskDate(b) || 0).getTime() - new Date(taskDate(a) || 0).getTime();
        }
        return (b.priority ?? 0) - (a.priority ?? 0);
      });
  }, [tasks, statusFilter, selectedAgent, priorityFilter, ordering, hideAgentFilter]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const task of filteredTasks) {
      const key =
        groupBy === "agent"
          ? agentMap.get(task.agentId) ?? "Unknown agent"
          : groupBy === "priority"
            ? priorityLabel(task.priority)
            : task.status;
      groups.set(key, [...(groups.get(key) ?? []), task]);
    }

    if (groupBy === "status") {
      const ordered = statusOrder
        .filter((status) => groups.has(status) || showEmptyColumns)
        .map((status) => [status, groups.get(status) ?? []] as const);
      return ordered;
    }

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTasks, groupBy, agentMap, showEmptyColumns]);

  const activeFilterCount = [
    statusFilter !== "all",
    !hideAgentFilter && selectedAgent !== "all",
    priorityFilter !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setStatusFilter("all");
    setSelectedAgent("all");
    setPriorityFilter("all");
  };

  const handleExecute = useCallback(async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await fetch(`/api/tasks/${taskId}/execute`, { method: "POST" });
      refresh();
    } finally {
      setActionLoading(null);
    }
  }, [refresh]);

  const handleCancel = useCallback(async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await fetch(`/api/tasks/${taskId}/cancel`, { method: "POST" });
      refresh();
    } finally {
      setActionLoading(null);
    }
  }, [refresh]);

  const handleDelete = useCallback(async (taskId: string) => {
    if (!confirm("Delete this task?")) return;
    setActionLoading(taskId);
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      refresh();
    } finally {
      setActionLoading(null);
    }
  }, [refresh]);

  const handleSetPriority = useCallback(
    async (taskId: string, priority: number) => {
      await updateTask(taskId, { priority });
    },
    [updateTask]
  );

  const openTask = (taskId: string) => router.push(`/studio/tasks/${taskId}`);

  const openCreateAt = useCallback((date: Date) => {
    setCreatePrefillDate(format(date, "yyyy-MM-dd'T'HH:mm"));
    setShowCreateDialog(true);
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant={statusFilter === "all" ? "secondary" : "outline"}
              size="sm"
              className="h-8 rounded-md"
              onClick={() => setStatusFilter("all")}
            >
              All tasks
            </Button>
            <Button
              variant={statusFilter === "active" ? "secondary" : "outline"}
              size="sm"
              className="h-8 rounded-md"
              onClick={() => setStatusFilter("active")}
            >
              Active
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-md">
                  <Filter className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 rounded-md px-1.5 text-[10px]">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Add Filter
                </DropdownMenuLabel>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuRadioGroup
                      value={statusFilter}
                      onValueChange={(value) => setStatusFilter(value as StatusFilter)}
                    >
                      <DropdownMenuRadioItem value="active">Active</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                      {statusOrder.map((status) => (
                        <DropdownMenuRadioItem key={status} value={status}>
                          {statusConfig[status]?.label ?? status}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {!hideAgentFilter && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Agent</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64">
                      <DropdownMenuRadioGroup value={selectedAgent} onValueChange={setSelectedAgent}>
                        <DropdownMenuRadioItem value="all">
                          All agents
                          <span className="ml-auto text-xs text-muted-foreground">{tasks.length}</span>
                        </DropdownMenuRadioItem>
                        {agents.map((agent) => (
                          <DropdownMenuRadioItem key={agent.agentId} value={agent.agentId}>
                            <span className="truncate">{agent.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {agentCounts.get(agent.agentId) ?? 0}
                            </span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Priority</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuRadioGroup
                      value={priorityFilter}
                      onValueChange={(value) => setPriorityFilter(value as PriorityFilter)}
                    >
                      <DropdownMenuRadioItem value="all">All priorities</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="high">High</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="medium">Medium</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="low">Low</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="none">No priority</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {activeFilterCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={clearFilters}>
                      <X className="h-4 w-4" />
                      Clear filters
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {!hideAgentFilter && selectedAgent !== "all" && (
              <Badge variant="secondary" className="h-8 gap-1 rounded-md px-2">
                Agent: {agentMap.get(selectedAgent) ?? "Unknown"}
                <button type="button" onClick={() => setSelectedAgent("all")}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-8 rounded"
                onClick={() => setViewMode("list")}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "board" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-8 rounded"
                onClick={() => setViewMode("board")}
                aria-label="Board view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "calendar" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-8 rounded"
                onClick={() => setViewMode("calendar")}
                aria-label="Calendar view"
              >
                <Calendar className="h-4 w-4" />
              </Button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>View options</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {viewMode === "board" && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      Group
                      <span className="ml-auto text-xs capitalize text-muted-foreground">{groupBy}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value={groupBy}
                        onValueChange={(value) => setGroupBy(value as GroupBy)}
                      >
                        <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="agent">Agent</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="priority">Priority</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    Order
                    <span className="ml-auto text-xs capitalize text-muted-foreground">{ordering}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={ordering}
                      onValueChange={(value) => setOrdering(value as Ordering)}
                    >
                      <DropdownMenuRadioItem value="priority">Priority</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="created">Created</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="scheduled">Scheduled</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {viewMode === "board" && (
                  <DropdownMenuCheckboxItem
                    checked={showEmptyColumns}
                    onCheckedChange={(checked) => setShowEmptyColumns(checked === true)}
                  >
                    Show empty status groups
                  </DropdownMenuCheckboxItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* The studio page header owns task creation; only show a button
                when no external trigger was registered (e.g. agent page). */}
            {!onRegisterCreate && (
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-3.5 w-3.5" />
                New task
              </Button>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "min-h-0 flex-1",
          viewMode === "calendar"
            ? "flex flex-col overflow-hidden"
            : viewMode === "list"
              ? "overflow-auto"
              : "overflow-auto px-4 py-3",
        )}
      >
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === "calendar" ? (
          <TaskCalendarView
            tasks={filteredTasks}
            agentMap={agentMap}
            actionLoading={actionLoading}
            onOpenTask={openTask}
            onExecute={handleExecute}
            onCancel={handleCancel}
            onDelete={handleDelete}
            onCreateAt={openCreateAt}
            rescheduleTask={rescheduleTask}
            updateTask={updateTask}
          />
        ) : filteredTasks.length === 0 ? (
          <div
            className={cn(
              "flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center",
              viewMode === "list" && "m-4",
            )}
          >
            <Calendar className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No tasks found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adjust filters or create a new task.
            </p>
          </div>
        ) : viewMode === "list" ? (
          <div className="w-full">
            {filteredTasks.map((task) => (
              <TaskRow
                key={task.taskId}
                task={task}
                agentName={agentMap.get(task.agentId) ?? "Unknown agent"}
                isActing={actionLoading === task.taskId}
                onOpen={openTask}
                onExecute={handleExecute}
                onCancel={handleCancel}
                onDelete={handleDelete}
                onSetPriority={handleSetPriority}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-w-[920px] gap-3">
            {groupedTasks.map(([group, items]) => {
              const label = groupBy === "status" ? statusConfig[group]?.label ?? group : group;
              return (
                <section
                  key={group}
                  className="flex max-h-full min-w-[280px] flex-1 flex-col rounded-lg bg-muted/25"
                >
                  <div className="flex h-11 items-center gap-2 px-3 text-sm font-medium">
                    {groupBy === "status" && <StatusDot status={group as Task["status"]} />}
                    <span>{label}</span>
                    <span className="text-muted-foreground">{items.length}</span>
                    <MoreHorizontal className="ml-auto h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
                    {items.map((task) => (
                      <TaskBoardCard
                        key={task.taskId}
                        task={task}
                        agentName={agentMap.get(task.agentId) ?? "Unknown agent"}
                        isActing={actionLoading === task.taskId}
                        onOpen={openTask}
                        onExecute={handleExecute}
                        onCancel={handleCancel}
                        onDelete={handleDelete}
                        onSetPriority={handleSetPriority}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <CreateTaskDialog
        open={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setCreatePrefillDate(undefined);
        }}
        userAddress={userAddress}
        preSelectedAgentId={preSelectedAgentId ?? agentId}
        initialScheduledFor={createPrefillDate}
        onTaskCreated={refresh}
      />
    </div>
  );
}
