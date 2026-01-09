"use client";

import React, { useState, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  userAddress: string;
  preSelectedAgentId?: string;
  onTaskCreated?: () => void;
}

export function CreateTaskDialog({
  open,
  onClose,
  userAddress,
  preSelectedAgentId,
  onTaskCreated,
}: CreateTaskDialogProps) {
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);

  const [formData, setFormData] = useState({
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
    scheduledFor: "",
  });

  useEffect(() => {
    if (open) {
      fetchAgents();
      fetchWorkflows();
      fetchTools();
      if (preSelectedAgentId) {
        setFormData((prev) => ({ ...prev, agentId: preSelectedAgentId }));
      }
    }
  }, [open, userAddress, preSelectedAgentId]);

  useEffect(() => {
    if (formData.agentId) {
      fetchSessions(formData.agentId);
    }
  }, [formData.agentId]);

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

  const fetchSessions = async (agentId: string) => {
    try {
      const response = await fetch(
        `/api/sessions?agentId=${agentId}&initiator=${userAddress}`
      );
      if (!response.ok) {
        console.error("Failed to fetch sessions:", response.statusText);
        return;
      }
      const data = await response.json();
      setSessions(data.data || []);
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    }
  };

  const fetchWorkflows = async () => {
    try {
      const response = await fetch(`/api/workflows?userAddress=${userAddress}`);
      if (!response.ok) {
        console.error("Failed to fetch workflows:", response.statusText);
        return;
      }
      const data = await response.json();
      setWorkflows(data.data || []);
    } catch (error) {
      console.error("Failed to fetch workflows:", error);
    }
  };

  const fetchTools = async () => {
    try {
      const response = await fetch(`/api/tools?userAddress=${userAddress}`);
      if (!response.ok) {
        console.error("Failed to fetch tools:", response.statusText);
        return;
      }
      const data = await response.json();
      setTools(data.data || []);
    } catch (error) {
      console.error("Failed to fetch tools:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let sessionId = formData.sessionId;
      // Create new session if not selected or "new-session" is selected
      if (!sessionId || sessionId === "new-session") {
        const sessionResponse = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: formData.agentId,
            initiator: userAddress,
            title: `Task: ${formData.title}`,
          }),
        });
        const sessionData = await sessionResponse.json();
        sessionId = sessionData.data.sessionId;
      }

      const taskPayload = {
        ...formData,
        sessionId,
        createdBy: userAddress,
        createdByType: "user" as const,
        scheduledFor: formData.scheduledFor
          ? new Date(formData.scheduledFor)
          : undefined,
      };

      const response = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskPayload),
      });

      if (!response.ok) throw new Error("Failed to create task");

      // Reset form
      setFormData({
        title: "",
        description: "",
        agentId: preSelectedAgentId || "",
        sessionId: "new-session",
        executionMode: "single",
        workflowId: "",
        priority: 0,
        tools: [],
        toolConstraintType: "none",
        toolInstructions: "",
        isRecurring: false,
        cronExpression: "",
        recurringSessionMode: "same",
        scheduledFor: "",
      });

      onTaskCreated?.();
      onClose();
    } catch (error) {
      console.error("Error creating task:", error);
      alert("Failed to create task. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isValid = formData.title && formData.agentId;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>
            Configure and assign a task to your agent
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Task Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="e.g., Generate weekly report"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Describe what this task should accomplish..."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="agent">Select Agent *</Label>
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Input
                    id="priority"
                    type="number"
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        priority: parseInt(e.target.value) || 0,
                      })
                    }
                    min="0"
                  />
                </div>

                <div>
                  <Label htmlFor="session">Session</Label>
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
                </div>
              </div>
            </div>

            {/* Execution Mode */}
            <div>
              <Label>Execution Mode</Label>
              <RadioGroup
                value={formData.executionMode}
                onValueChange={(value: any) =>
                  setFormData({ ...formData, executionMode: value })
                }
                className="grid grid-cols-3 gap-4 mt-2"
              >
                <div className="flex items-center space-x-2 border p-3 rounded-md">
                  <RadioGroupItem value="single" id="single" />
                  <Label htmlFor="single" className="font-normal cursor-pointer">
                    Single
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-md">
                  <RadioGroupItem value="workflow" id="workflow" />
                  <Label htmlFor="workflow" className="font-normal cursor-pointer">
                    Workflow
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-md">
                  <RadioGroupItem value="sequential" id="sequential" />
                  <Label
                    htmlFor="sequential"
                    className="font-normal cursor-pointer"
                  >
                    Sequential
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {formData.executionMode === "workflow" && (
              <div>
                <Label htmlFor="workflow">Select Workflow</Label>
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
              </div>
            )}

            {/* Tool Constraints */}
            <div>
              <Label>Tool Constraints</Label>
              <RadioGroup
                value={formData.toolConstraintType}
                onValueChange={(value: any) =>
                  setFormData({ ...formData, toolConstraintType: value })
                }
                className="grid grid-cols-3 gap-4 mt-2"
              >
                <div className="flex items-center space-x-2 border p-3 rounded-md">
                  <RadioGroupItem value="none" id="none" />
                  <Label htmlFor="none" className="font-normal cursor-pointer">
                    None
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-md">
                  <RadioGroupItem value="soft" id="soft" />
                  <Label htmlFor="soft" className="font-normal cursor-pointer">
                    Soft
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-md">
                  <RadioGroupItem value="hard" id="hard" />
                  <Label htmlFor="hard" className="font-normal cursor-pointer">
                    Hard
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {formData.toolConstraintType !== "none" && (
              <>
                <div>
                  <Label>Select Tools</Label>
                  <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2 mt-2">
                    {tools.map((tool) => (
                      <div key={tool.toolId} className="flex items-center space-x-2">
                        <Checkbox
                          id={tool.toolId}
                          checked={formData.tools.includes(tool.toolId)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({
                                ...formData,
                                tools: [...formData.tools, tool.toolId],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                tools: formData.tools.filter(
                                  (t) => t !== tool.toolId
                                ),
                              });
                            }
                          }}
                        />
                        <Label
                          htmlFor={tool.toolId}
                          className="font-normal cursor-pointer text-sm"
                        >
                          {tool.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="toolInstructions">Tool Instructions</Label>
                  <Textarea
                    id="toolInstructions"
                    value={formData.toolInstructions}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        toolInstructions: e.target.value,
                      })
                    }
                    placeholder="e.g., If validation fails, use the validateData tool"
                    rows={2}
                  />
                </div>
              </>
            )}

            {/* Scheduling */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isRecurring"
                  checked={formData.isRecurring}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isRecurring: checked as boolean })
                  }
                />
                <Label htmlFor="isRecurring" className="cursor-pointer">
                  Recurring Task
                </Label>
              </div>

              {formData.isRecurring ? (
                <>
                  <div>
                    <Label htmlFor="cronExpression">Cron Expression</Label>
                    <Input
                      id="cronExpression"
                      value={formData.cronExpression}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          cronExpression: e.target.value,
                        })
                      }
                      placeholder="e.g., 0 9 * * 1 (Every Monday at 9 AM)"
                    />
                  </div>

                  <div>
                    <Label>Session Mode</Label>
                    <RadioGroup
                      value={formData.recurringSessionMode}
                      onValueChange={(value: any) =>
                        setFormData({ ...formData, recurringSessionMode: value })
                      }
                      className="flex space-x-4 mt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="same" id="same" />
                        <Label htmlFor="same" className="font-normal">
                          Same Session
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="new" id="new" />
                        <Label htmlFor="new" className="font-normal">
                          New Session
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </>
              ) : (
                <div>
                  <Label htmlFor="scheduledFor">Schedule For</Label>
                  <Input
                    id="scheduledFor"
                    type="datetime-local"
                    value={formData.scheduledFor}
                    onChange={(e) =>
                      setFormData({ ...formData, scheduledFor: e.target.value })
                    }
                  />
                </div>
              )}
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid || loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Task"
                )}
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
