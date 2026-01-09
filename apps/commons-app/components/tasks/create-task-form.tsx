"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

interface Agent {
  agentId: string;
  name: string;
}

interface Session {
  sessionId: string;
  title?: string;
}

interface Workflow {
  workflowId: string;
  name: string;
}

interface Tool {
  toolId: string;
  name: string;
}

const steps = [
  { id: 1, name: "Basic Info", description: "Title, description, and agent" },
  { id: 2, name: "Execution", description: "Mode and workflow" },
  { id: 3, name: "Tools", description: "Tool selection and constraints" },
  { id: 4, name: "Schedule", description: "Timing and recurrence" },
  { id: 5, name: "Review", description: "Review and create" },
];

export function CreateTaskForm({ userAddress }: { userAddress: string }) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    agentId: "",
    sessionId: "",
    executionMode: "single" as "single" | "workflow" | "sequential",
    workflowId: "",
    workflowInputs: {},
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
    fetchAgents();
    fetchWorkflows();
    fetchTools();
  }, [userAddress]);

  useEffect(() => {
    if (formData.agentId) {
      fetchSessions(formData.agentId);
    }
  }, [formData.agentId]);

  const fetchAgents = async () => {
    try {
      const response = await fetch(`/api/v1/agents?owner=${userAddress}`);
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
      const data = await response.json();
      setSessions(data.data || []);
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    }
  };

  const fetchWorkflows = async () => {
    try {
      const response = await fetch(`/api/workflows?userAddress=${userAddress}`);
      const data = await response.json();
      setWorkflows(data.data || []);
    } catch (error) {
      console.error("Failed to fetch workflows:", error);
    }
  };

  const fetchTools = async () => {
    try {
      const response = await fetch(`/api/tools?userAddress=${userAddress}`);
      const data = await response.json();
      setTools(data.data || []);
    } catch (error) {
      console.error("Failed to fetch tools:", error);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Create or use existing session
      let sessionId = formData.sessionId;
      if (!sessionId) {
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
        scheduledFor: formData.scheduledFor ? new Date(formData.scheduledFor) : undefined,
      };

      const response = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskPayload),
      });

      if (!response.ok) throw new Error("Failed to create task");

      router.push("/studio/tasks");
    } catch (error) {
      console.error("Error creating task:", error);
      alert("Failed to create task. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.title && formData.agentId;
      case 2:
        return formData.executionMode !== "workflow" || formData.workflowId;
      case 3:
        return true; // Tools are optional
      case 4:
        return !formData.isRecurring || formData.cronExpression;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Generate weekly report"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this task should accomplish..."
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="agent">Select Agent *</Label>
              <Select value={formData.agentId} onValueChange={(value) => setFormData({ ...formData, agentId: value })}>
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

            <div>
              <Label htmlFor="session">Session (Optional)</Label>
              <Select value={formData.sessionId} onValueChange={(value) => setFormData({ ...formData, sessionId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Create new session or select existing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Create new session</SelectItem>
                  {sessions.map((session) => (
                    <SelectItem key={session.sessionId} value={session.sessionId}>
                      {session.title || `Session ${session.sessionId.slice(0, 8)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                placeholder="0"
                min="0"
              />
              <p className="text-xs text-gray-500 mt-1">Higher numbers = higher priority</p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <Label>Execution Mode</Label>
              <RadioGroup
                value={formData.executionMode}
                onValueChange={(value: any) => setFormData({ ...formData, executionMode: value })}
                className="space-y-3 mt-2"
              >
                <div className="flex items-start space-x-3 border p-3 rounded-md">
                  <RadioGroupItem value="single" id="single" className="mt-1" />
                  <div>
                    <Label htmlFor="single" className="font-semibold">Single Task</Label>
                    <p className="text-sm text-gray-500">Execute as a standalone task</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 border p-3 rounded-md">
                  <RadioGroupItem value="workflow" id="workflow" className="mt-1" />
                  <div>
                    <Label htmlFor="workflow" className="font-semibold">Workflow</Label>
                    <p className="text-sm text-gray-500">Execute a predefined workflow</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 border p-3 rounded-md">
                  <RadioGroupItem value="sequential" id="sequential" className="mt-1" />
                  <div>
                    <Label htmlFor="sequential" className="font-semibold">Sequential</Label>
                    <p className="text-sm text-gray-500">Execute tasks one after another</p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {formData.executionMode === "workflow" && (
              <div>
                <Label htmlFor="workflow">Select Workflow *</Label>
                <Select value={formData.workflowId} onValueChange={(value) => setFormData({ ...formData, workflowId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a workflow" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((workflow) => (
                      <SelectItem key={workflow.workflowId} value={workflow.workflowId}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <Label>Tool Constraint Type</Label>
              <RadioGroup
                value={formData.toolConstraintType}
                onValueChange={(value: any) => setFormData({ ...formData, toolConstraintType: value })}
                className="space-y-3 mt-2"
              >
                <div className="flex items-start space-x-3 border p-3 rounded-md">
                  <RadioGroupItem value="none" id="none" className="mt-1" />
                  <div>
                    <Label htmlFor="none" className="font-semibold">No Constraints</Label>
                    <p className="text-sm text-gray-500">Agent can use any available tools</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 border p-3 rounded-md">
                  <RadioGroupItem value="soft" id="soft" className="mt-1" />
                  <div>
                    <Label htmlFor="soft" className="font-semibold">Soft Recommendation</Label>
                    <p className="text-sm text-gray-500">Agent should prefer specified tools</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 border p-3 rounded-md">
                  <RadioGroupItem value="hard" id="hard" className="mt-1" />
                  <div>
                    <Label htmlFor="hard" className="font-semibold">Hard Constraint</Label>
                    <p className="text-sm text-gray-500">Agent can ONLY use specified tools</p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {formData.toolConstraintType !== "none" && (
              <>
                <div>
                  <Label>Select Tools</Label>
                  <div className="border rounded-md p-4 max-h-60 overflow-y-auto space-y-2 mt-2">
                    {tools.map((tool) => (
                      <div key={tool.toolId} className="flex items-center space-x-2">
                        <Checkbox
                          id={tool.toolId}
                          checked={formData.tools.includes(tool.toolId)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({ ...formData, tools: [...formData.tools, tool.toolId] });
                            } else {
                              setFormData({ ...formData, tools: formData.tools.filter((t) => t !== tool.toolId) });
                            }
                          }}
                        />
                        <Label htmlFor={tool.toolId} className="font-normal cursor-pointer">
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
                    onChange={(e) => setFormData({ ...formData, toolInstructions: e.target.value })}
                    placeholder="e.g., If you encounter data validation errors, use the validateData tool first"
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">Provide guidance on when/how to use specific tools</p>
                </div>
              </>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isRecurring"
                checked={formData.isRecurring}
                onCheckedChange={(checked) => setFormData({ ...formData, isRecurring: checked as boolean })}
              />
              <Label htmlFor="isRecurring" className="font-semibold cursor-pointer">
                Recurring Task
              </Label>
            </div>

            {formData.isRecurring ? (
              <>
                <div>
                  <Label htmlFor="cronExpression">Cron Expression *</Label>
                  <Input
                    id="cronExpression"
                    value={formData.cronExpression}
                    onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                    placeholder="e.g., 0 9 * * 1 (Every Monday at 9 AM)"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use cron syntax: minute hour day month weekday
                  </p>
                </div>

                <div>
                  <Label>Session Mode for Recurrence</Label>
                  <RadioGroup
                    value={formData.recurringSessionMode}
                    onValueChange={(value: any) => setFormData({ ...formData, recurringSessionMode: value })}
                    className="space-y-2 mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="same" id="same" />
                      <Label htmlFor="same" className="font-normal">Same Session (Keep history)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="new" id="new" />
                      <Label htmlFor="new" className="font-normal">New Session (Fresh start each time)</Label>
                    </div>
                  </RadioGroup>
                </div>
              </>
            ) : (
              <div>
                <Label htmlFor="scheduledFor">Schedule For (Optional)</Label>
                <Input
                  id="scheduledFor"
                  type="datetime-local"
                  value={formData.scheduledFor}
                  onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty to execute immediately when ready</p>
              </div>
            )}
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-md space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">Title:</p>
                <p className="text-sm">{formData.title}</p>
              </div>
              {formData.description && (
                <div>
                  <p className="text-sm font-semibold text-gray-700">Description:</p>
                  <p className="text-sm">{formData.description}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-700">Agent:</p>
                <p className="text-sm">{agents.find((a) => a.agentId === formData.agentId)?.name}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Execution Mode:</p>
                <Badge>{formData.executionMode}</Badge>
              </div>
              {formData.priority > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700">Priority:</p>
                  <p className="text-sm">{formData.priority}</p>
                </div>
              )}
              {formData.toolConstraintType !== "none" && (
                <div>
                  <p className="text-sm font-semibold text-gray-700">Tool Constraints:</p>
                  <Badge variant="outline">{formData.toolConstraintType}</Badge>
                  <p className="text-sm mt-1">{formData.tools.length} tools selected</p>
                </div>
              )}
              {formData.isRecurring && (
                <div>
                  <p className="text-sm font-semibold text-gray-700">Recurring:</p>
                  <p className="text-sm">{formData.cronExpression}</p>
                  <Badge variant="outline" className="mt-1">
                    {formData.recurringSessionMode} session
                  </Badge>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    step.id < currentStep
                      ? "bg-green-500 text-white"
                      : step.id === currentStep
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {step.id < currentStep ? <CheckCircle2 className="h-5 w-5" /> : step.id}
                </div>
                <p className="text-xs mt-1 text-center font-medium">{step.name}</p>
                <p className="text-xs text-gray-500 text-center hidden md:block">{step.description}</p>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${step.id < currentStep ? "bg-green-500" : "bg-gray-200"}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Form Content */}
      <Card>
        <CardHeader>
          <CardTitle>{steps[currentStep - 1].name}</CardTitle>
          <CardDescription>{steps[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {renderStep()}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-6">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(currentStep - 1)}
              disabled={currentStep === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            {currentStep < steps.length ? (
              <Button onClick={() => setCurrentStep(currentStep + 1)} disabled={!canProceed()}>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading || !canProceed()}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Task"
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
