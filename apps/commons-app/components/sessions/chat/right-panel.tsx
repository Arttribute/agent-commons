"use client";

import { useState } from "react";
import { Maximize2, Minimize2, CheckCircle2, Code } from "lucide-react";
import TaskCarousel from "@/components/sessions/tasks/task-carousel";
import { cn } from "@/lib/utils";

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
  tasks: Task[];
  className?: string;
}

export default function RightPanel({ tasks, className }: RightPanelProps) {
  return (
    <div
      className={cn(
        " md:w-full bg-white dark:bg-gray-950 flex flex-col h-full",
        className
      )}
    >
      <div className="flex justify-between items-center ">
        <TaskCarousel tasks={tasks} />
      </div>
    </div>
  );
}
