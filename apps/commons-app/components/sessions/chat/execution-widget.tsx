"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Maximize2,
  Minimize2,
  Layers,
  Clock,
  CircleDashed,
  CircleDot,
  CircleAlert,
  CircleCheckBig,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TaskCarousel from "@/components/sessions/tasks/task-carousel";
import MessagesView from "@/components/sessions/chat/messages-view";
import SpacesView from "@/components/spaces/spaces-view";

interface Task {
  taskId: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  priority: number;
  agentId: string;
  sessionId: string;
  executionMode?: "single" | "workflow" | "sequential";
  isRecurring?: boolean;
  tools?: string[];
  toolConstraintType?: "hard" | "soft" | "none";
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface Space {
  spaceId: string;
  name: string;
  description: string;
  createdBy: string;
  createdByType: "agent" | "human";
  sessionId: string;
  isPublic: boolean;
  maxMembers: number;
  settings: {
    moderators: string[];
    allowAgents: boolean;
    allowHumans: boolean;
    requireApproval: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

interface Goal {
  goalId: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}

interface ExecutionWidgetProps {
  sessionId: string;
  tasks: Task[];
  childSessions: any[];
  spaces?: Space[];
}

export default function ExecutionWidget({
  sessionId,
  tasks,
  childSessions,
  spaces = [],
}: ExecutionWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  if (tasks.length === 0 && childSessions.length === 0) return null;

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
    if (isMinimized && !isExpanded) {
      setIsMinimized(false);
    }
  };

  const toggleMinimized = () => {
    setIsMinimized(!isMinimized);
    if (isExpanded) {
      setIsExpanded(false);
    }
  };

  // Calculate stats for all tasks
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const inProgressTasks = tasks.filter((task) => task.status === "running").length;
  const pendingTasks = tasks.filter((task) => task.status === "pending").length;
  const failedTasks = tasks.filter((task) => task.status === "failed").length;

  // Calculate overall progress based on task completion
  const calculateOverallProgress = () => {
    if (totalTasks === 0) return 0;
    return Math.round((completedTasks / totalTasks) * 100);
  };

  return (
    <AnimatePresence>
      <motion.div
        className={cn(
          "fixed bottom-4 right-4 z-50 flex flex-col",
          isExpanded ? "w-[650px] h-[600px]" : "w-auto"
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {isExpanded ? (
          <motion.div
            className="bg-white dark:bg-gray-950 rounded-lg shadow-lg border border-gray-400 overflow-hidden flex flex-col h-full max-h-[600px]"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <Tabs defaultValue="tasks" className="w-full">
              <div className="p-3 border-b border-gray-400 flex justify-between items-center">
                <div className="flex items-center gap-1 font-semibold">
                  <div className="bg-purple-100 dark:bg-purple-900 p-0.5 rounded">
                    <Layers className="h-4 w-4 text-purple-500" />
                  </div>
                  <h3 className="font-semibold text-sm">Agent Execution</h3>
                </div>
                <div className="flex gap-1">
                  <TabsList className="grid w-full grid-cols-3 gap-1 h-auto">
                    <TabsTrigger value="tasks" className="h-6  text-sm">
                      Tasks
                    </TabsTrigger>
                    <TabsTrigger value="messages" className="h-6 text-sm">
                      Interactions{" "}
                    </TabsTrigger>
                    <TabsTrigger value="spaces" className="h-6 text-sm">
                      Spaces
                    </TabsTrigger>
                  </TabsList>

                  <button
                    onClick={toggleExpanded}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded"
                  >
                    <Minimize2 className="h-4 w-4 text-gray-500 hover:text-gray-700 cursor-pointer" />
                  </button>
                </div>
              </div>
              <TabsContent value="tasks">
                <div className="flex justify-between items-center ">
                  <TaskCarousel tasks={tasks} />
                </div>
              </TabsContent>
              <TabsContent value="messages">
                <MessagesView
                  conversations={childSessions}
                  totalInteractions={childSessions.length || 0}
                />
              </TabsContent>
              <TabsContent value="spaces">
                <SpacesView spaces={spaces} />
              </TabsContent>
            </Tabs>
          </motion.div>
        ) : (
          <motion.div
            className={cn(
              "bg-white dark:bg-gray-950 rounded-lg shadow-xl border border-gray-400 overflow-hidden w-[220px]"
            )}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <button onClick={toggleExpanded} className="w-full">
              <div className="px-2 py-1.5 flex border-b border-gray-400 w-full">
                <div className="flex items-center w-full text-sm">
                  <div className="flex items-center gap-1 font-semibold">
                    <div className="bg-gray-100 dark:bg-purple-900 p-0.5 rounded">
                      <Layers className="h-3.5 w-3.5 text-purple-500" />
                    </div>
                    <span>Agent execution</span>
                  </div>

                  <div className="ml-auto p-0.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded">
                    <Maximize2 className="h-4 w-4 text-gray-500 hover:text-gray-700 cursor-pointer" />
                  </div>
                </div>
              </div>
            </button>

            <div className="max-h-[200px] overflow-auto">
              <div className="border border-gray-400 rounded-lg m-1">
                <div className="mx-2 mt-1 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="">Tasks:</span>
                    <span className="font-medium">{totalTasks}</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="">Overall Progress:</span>
                      <span>{calculateOverallProgress()}%</span>
                    </div>

                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                      <div
                        className="bg-zinc-700 h-1 rounded-full"
                        style={{
                          width: `${calculateOverallProgress()}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-center text-xs mt-1">
                    <div className="flex items-center dark:bg-green-900/20 p-1 rounded gap-1">
                      <CircleCheckBig className="h-3 w-3 text-green-500" />
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {completedTasks}
                      </span>
                    </div>
                    <div className="flex items-center dark:bg-blue-900/20 p-1 rounded gap-1">
                      <CircleDot className="h-3 w-3 text-blue-500" />
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        {inProgressTasks}
                      </span>
                    </div>
                    <div className="flex items-center dark:bg-gray-800 p-1 rounded gap-1">
                      <CircleDashed className="h-3 w-3 text-gray-500" />
                      <span className="font-medium text-gray-600 dark:text-gray-400">
                        {pendingTasks}
                      </span>
                    </div>

                    <div className="flex items-center dark:bg-red-900/20 p-1 rounded gap-1">
                      <CircleAlert className="h-3 w-3 text-red-500" />
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {failedTasks}
                      </span>
                    </div>
                  </div>
                </div>

                {inProgressTasks > 0 && tasks.find((t) => t.status === "in_progress") && (
                  <div className="border-t border-gray-400 pt-2 mt-2 mb-2">
                    <div className="mx-2 space-y-1">
                      <div className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3 text-blue-500" />
                        <span className="truncate">
                          {tasks.find((t) => t.status === "in_progress")?.title}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
