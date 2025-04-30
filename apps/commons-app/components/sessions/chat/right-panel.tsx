"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Maximize2, Minimize2, CheckCircle2, Code } from "lucide-react";
import TaskCarousel from "@/components/sessions/goals/task-carousel";
import GoalView from "@/components/sessions/goals/goal-view";
import { cn } from "@/lib/utils";

interface Goal {
  goalId: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  priority: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  tasks: Task[];
}

interface TaskContext {
  inputs?: Record<string, any>;
  objective?: string;
  expectedOutputType?: string;
}

interface Task {
  taskId: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  priority: number;
  progress: number;
  context?: TaskContext;
  summary?: string | null;
  resultContent?: string | null;
  createdAt: string;
  updatedAt: string;
  actualStart?: string | null;
  actualEnd?: string | null;
}

interface RightPanelProps {
  goal: Goal | null;
  className?: string;
}

export default function RightPanel({ goal, className }: RightPanelProps) {
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [activeTab, setActiveTab] = useState("goal");

  const toggleCompactMode = () => {
    setIsCompactMode(!isCompactMode);
  };

  if (!goal) {
    return (
      <div className="border-l bg-white dark:bg-gray-950 md:w-[600px] flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        No active goal. Start a conversation to create a goal.
      </div>
    );
  }

  const tasks = goal.tasks || [];
  const completedTasks = tasks.filter((task) => task.status === "completed");

  return (
    <div
      className={cn(
        "border-l md:w-[600px] bg-white dark:bg-gray-950 flex flex-col h-full",
        className
      )}
    >
      <div className="flex justify-between items-center p-3 border-b">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-between items-center">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="goal">Goal</TabsTrigger>
              <TabsTrigger value="tasks">
                Tasks ({completedTasks.length}/{tasks.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden mt-3 h-full">
            <TabsContent
              value="goal"
              className="h-full m-0 data-[state=inactive]:hidden overflow-auto"
            >
              <GoalView goal={goal} />
            </TabsContent>
            <TabsContent
              value="tasks"
              className="h-full m-0 data-[state=inactive]:hidden overflow-auto"
            >
              <TaskCarousel tasks={tasks} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
