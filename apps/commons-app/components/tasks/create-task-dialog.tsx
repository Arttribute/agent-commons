"use client";

import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useAgents } from "@/hooks/use-agents";
import { useWorkflows } from "@/hooks/use-workflows";
import type { Session } from "@agent-commons/sdk";

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  userAddress: string;
  preSelectedAgentId?: string;
  /** Prefills "Schedule For" (datetime-local format) — e.g. from a calendar slot click. */
  initialScheduledFor?: string;
  onTaskCreated?: () => void;
}

function toDatetimeLocal(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const EMPTY_FORM = (preSelectedAgentId?: string, initialScheduledFor?: string) => ({
  title: "",
  description: "",
  agentId: preSelectedAgentId || "",
  sessionId: "new-session",
  executionMode: "single" as "single" | "workflow" | "sequential",
  workflowId: "",
  priority: 0,
  tools: [] as string[],
  toolConstraintType: "none" as "hard" | "soft" | "none",
  toolInstructions: "",
  isRecurring: false,
  cronExpression: "",
  recurringSessionMode: "same" as "same" | "new",
  scheduledFor: initialScheduledFor ?? "",
});

/** Minimal segmented choice — replaces the boxed radio groups. */
function SegmentedChoice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FieldGroup({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function CreateTaskDialog({
  open,
  onClose,
  userAddress,
  preSelectedAgentId,
  initialScheduledFor,
  onTaskCreated,
}: CreateTaskDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [formData, setFormData] = useState(EMPTY_FORM(preSelectedAgentId, initialScheduledFor));

  const { agents } = useAgents(userAddress);
  const { workflows } = useWorkflows(userAddress, "user");

  useEffect(() => {
    if (open) {
      fetch("/api/tools").then((r) => r.json()).then((d) => setTools(d.data ?? [])).catch(() => {});
      setFormData(EMPTY_FORM(preSelectedAgentId, initialScheduledFor));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!formData.agentId) return;
    fetch(`/api/sessions/list?agentId=${formData.agentId}&initiatorId=${encodeURIComponent(userAddress)}`)
      .then((r) => r.json())
      .then((d) => setSessions(d.data ?? []))
      .catch(() => setSessions([]));
  }, [formData.agentId, userAddress]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.isRecurring && formData.scheduledFor && new Date(formData.scheduledFor).getTime() < Date.now()) {
      alert("Schedule time must be in the future.");
      return;
    }

    setLoading(true);

    try {
      let sessionId = formData.sessionId;
      if (!sessionId || sessionId === "new-session") {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: formData.agentId, initiator: userAddress, title: `Task: ${formData.title}` }),
        });
        const sessionData = await res.json();
        if (!res.ok) throw new Error(sessionData.message || "Failed to create session");
        sessionId = sessionData.data?.sessionId;
        if (!sessionId) throw new Error("Session creation returned no sessionId");
      }

      const taskRes = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          sessionId,
          createdBy: userAddress,
          createdByType: "user",
          scheduledFor: formData.scheduledFor ? new Date(formData.scheduledFor) : undefined,
        }),
      });
      const taskData = await taskRes.json();
      if (!taskRes.ok) throw new Error(taskData.message || "Failed to create task");

      setFormData(EMPTY_FORM(preSelectedAgentId));
      onTaskCreated?.();
      onClose();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isValid = formData.title && formData.agentId;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] gap-0 sm:max-w-3xl">
        <DialogHeader className="pb-2">
          <DialogTitle>Create new task</DialogTitle>
          <DialogDescription>
            Configure and assign a task to your agent.
          </DialogDescription>
        </DialogHeader>

        {/* Inner padding keeps input focus rings clear of the scroll clip. */}
        <div className="-mx-2 max-h-[calc(90vh-160px)] overflow-y-auto px-2">
          <form
            id="create-task-form"
            onSubmit={handleSubmit}
            className="space-y-5 py-3"
          >
            <FieldGroup label="Title" htmlFor="title">
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="e.g. Generate weekly report"
                required
              />
            </FieldGroup>

            <FieldGroup label="Description" htmlFor="description">
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Describe what this task should accomplish…"
                rows={3}
              />
            </FieldGroup>

            <div className="grid gap-5 sm:grid-cols-2">
              <FieldGroup label="Agent">
                <Select
                  value={formData.agentId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, agentId: value })
                  }
                  disabled={!!preSelectedAgentId}
                >
                  <SelectTrigger>
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
              </FieldGroup>

              <FieldGroup label="Session">
                <Select
                  value={formData.sessionId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, sessionId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="New session" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new-session">Create new session</SelectItem>
                    {sessions.map((session) => (
                      <SelectItem
                        key={session.sessionId}
                        value={session.sessionId}
                      >
                        {session.title || `Session ${session.sessionId.slice(0, 8)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <FieldGroup label="Execution mode">
                <SegmentedChoice
                  value={formData.executionMode}
                  options={[
                    { value: "single", label: "Single" },
                    { value: "workflow", label: "Workflow" },
                    { value: "sequential", label: "Sequential" },
                  ]}
                  onChange={(value) =>
                    setFormData({ ...formData, executionMode: value })
                  }
                />
              </FieldGroup>

              <FieldGroup label="Priority" htmlFor="priority">
                <Input
                  id="priority"
                  type="number"
                  className="max-w-28"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priority: parseInt(e.target.value) || 0,
                    })
                  }
                  min="0"
                />
              </FieldGroup>
            </div>

            {formData.executionMode === "workflow" && (
              <FieldGroup label="Workflow">
                <Select
                  value={formData.workflowId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, workflowId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a workflow" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((workflow) => (
                      <SelectItem
                        key={workflow.workflowId}
                        value={workflow.workflowId}
                      >
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>
            )}

            <FieldGroup
              label="Tool constraints"
              hint={
                formData.toolConstraintType === "none"
                  ? "The agent decides which tools to use."
                  : formData.toolConstraintType === "soft"
                    ? "Suggest tools the agent should prefer."
                    : "Restrict the agent to the selected tools."
              }
            >
              <SegmentedChoice
                value={formData.toolConstraintType}
                options={[
                  { value: "none", label: "None" },
                  { value: "soft", label: "Soft" },
                  { value: "hard", label: "Hard" },
                ]}
                onChange={(value) =>
                  setFormData({ ...formData, toolConstraintType: value })
                }
              />
            </FieldGroup>

            {formData.toolConstraintType !== "none" && (
              <>
                <FieldGroup label="Tools">
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-3">
                    {tools.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No custom tools available.
                      </p>
                    ) : (
                      tools.map((tool) => (
                        <div key={tool.toolId} className="flex items-center gap-2">
                          <Checkbox
                            id={tool.toolId}
                            checked={formData.tools.includes(tool.toolId)}
                            onCheckedChange={(checked) => {
                              setFormData({
                                ...formData,
                                tools: checked
                                  ? [...formData.tools, tool.toolId]
                                  : formData.tools.filter((t) => t !== tool.toolId),
                              });
                            }}
                          />
                          <Label
                            htmlFor={tool.toolId}
                            className="cursor-pointer text-sm font-normal"
                          >
                            {tool.displayName || tool.name}
                          </Label>
                        </div>
                      ))
                    )}
                  </div>
                </FieldGroup>

                <FieldGroup label="Tool instructions" htmlFor="toolInstructions">
                  <Textarea
                    id="toolInstructions"
                    value={formData.toolInstructions}
                    onChange={(e) =>
                      setFormData({ ...formData, toolInstructions: e.target.value })
                    }
                    placeholder="e.g. If validation fails, use the validateData tool"
                    rows={2}
                  />
                </FieldGroup>
              </>
            )}

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isRecurring"
                  checked={formData.isRecurring}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isRecurring: checked as boolean })
                  }
                />
                <Label htmlFor="isRecurring" className="cursor-pointer">
                  Recurring task
                </Label>
              </div>

              {formData.isRecurring ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <FieldGroup
                    label="Cron expression"
                    htmlFor="cronExpression"
                    hint="e.g. 0 9 * * 1 — every Monday at 9 AM"
                  >
                    <Input
                      id="cronExpression"
                      value={formData.cronExpression}
                      onChange={(e) =>
                        setFormData({ ...formData, cronExpression: e.target.value })
                      }
                      placeholder="0 9 * * 1"
                    />
                  </FieldGroup>

                  <FieldGroup label="Session mode">
                    <SegmentedChoice
                      value={formData.recurringSessionMode}
                      options={[
                        { value: "same", label: "Same session" },
                        { value: "new", label: "New session" },
                      ]}
                      onChange={(value) =>
                        setFormData({ ...formData, recurringSessionMode: value })
                      }
                    />
                  </FieldGroup>
                </div>
              ) : (
                <FieldGroup label="Schedule for" htmlFor="scheduledFor">
                  <Input
                    id="scheduledFor"
                    type="datetime-local"
                    className="max-w-60"
                    min={toDatetimeLocal(new Date())}
                    value={formData.scheduledFor}
                    onChange={(e) =>
                      setFormData({ ...formData, scheduledFor: e.target.value })
                    }
                  />
                </FieldGroup>
              )}
            </div>
          </form>
        </div>

        <DialogFooter className="pt-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-task-form"
            disabled={!isValid || loading}
            className="gap-1.5"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Creating…" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
