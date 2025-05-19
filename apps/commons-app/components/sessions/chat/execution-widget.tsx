"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Maximize2,
  Minimize2,
  Layers,
  Cog,
  Clock,
  CircleDashed,
  CircleDot,
  CircleAlert,
  X,
  CircleCheckBig,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import RightPanel from "./right-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Task {
  taskId: string;
  goalId: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  progress: number;
  priority: number;
  result?: string;
  error?: string;
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
  goals: Goal[];
  selectedGoal: Goal | null;
  selectedGoalId: string;
  setSelectedGoalId: (goalId: string) => void;
}

export default function ExecutionWidget({
  sessionId,
  goals,
  selectedGoal,
  selectedGoalId,
  setSelectedGoalId,
}: ExecutionWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch tasks for the selected goal
  useEffect(() => {
    if (selectedGoalId) {
      const fetchTasks = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const res = await fetch(
            `/api/goals/goal/tasks?goalId=${selectedGoalId}`
          );
          if (!res.ok) {
            throw new Error("Failed to fetch tasks");
          }
          const data = await res.json();
          // Update the goals state with the fetched tasks
          const updatedGoals = goals.map((goal) =>
            goal.goalId === selectedGoalId
              ? { ...goal, tasks: data.tasks }
              : goal
          );
          // You'll need to implement a way to update the goals state in the parent component
        } catch (err) {
          console.error("Error fetching tasks:", err);
          setError("Failed to load tasks");
        } finally {
          setIsLoading(false);
        }
      };
      fetchTasks();
    }
  }, [selectedGoalId, goals]);

  if (goals.length === 0) return null;

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

  // Calculate stats for all goals
  const totalTasks = goals.reduce((acc, goal) => acc + goal.tasks.length, 0);
  const completedTasks = goals.reduce(
    (acc, goal) =>
      acc + goal.tasks.filter((task) => task.status === "completed").length,
    0
  );
  const inProgressTasks = goals.reduce(
    (acc, goal) =>
      acc + goal.tasks.filter((task) => task.status === "in_progress").length,
    0
  );
  const pendingTasks = goals.reduce(
    (acc, goal) =>
      acc + goal.tasks.filter((task) => task.status === "pending").length,
    0
  );

  // Stats for selected goal
  const selectedGoalTasks = selectedGoal?.tasks || [];
  const selectedGoalCompletedTasks = selectedGoalTasks.filter(
    (task) => task.status === "completed"
  );
  const selectedGoalInProgressTasks = selectedGoalTasks.filter(
    (task) => task.status === "in_progress"
  );
  const selectedGoalPendingTasks = selectedGoalTasks.filter(
    (task) => task.status === "pending"
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "in_progress":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Calculate overall progress based on task completion
  const calculateOverallProgress = (goals: Goal[]) => {
    if (goals.length === 0) return 0;

    const totalTasks = goals.reduce((acc, goal) => acc + goal.tasks.length, 0);
    if (totalTasks === 0) return 0;

    const completedTasks = goals.reduce(
      (acc, goal) =>
        acc + goal.tasks.filter((task) => task.status === "completed").length,
      0
    );

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
            <div className="p-3 border-b border-gray-400 flex justify-between items-center">
              <div className="flex items-center gap-1 font-semibold">
                <div className="bg-purple-100 dark:bg-purple-900 p-0.5 rounded">
                  <Layers className="h-4 w-4 text-purple-500" />
                </div>
                <h3 className="font-semibold text-sm">Agent Execution</h3>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={toggleExpanded}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded"
                >
                  <Minimize2 className="h-4 w-4 text-gray-500 hover:text-gray-700 cursor-pointer" />
                </button>
              </div>
            </div>

            <RightPanel tasks={selectedGoalTasks} className="" />
          </motion.div>
        ) : (
          <motion.div
            className={cn(
              "bg-white dark:bg-gray-950 rounded-lg shadow-xl border border-gray-400 overflow-hidden",
              isMinimized ? "w-auto" : "w-[220px]"
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
                      <span>{calculateOverallProgress(goals)}%</span>
                    </div>

                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                      <div
                        className="bg-zinc-700 h-1 rounded-full"
                        style={{
                          width: `${calculateOverallProgress(goals)}%`,
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
                        {goals.reduce(
                          (acc, goal) =>
                            acc +
                            goal.tasks.filter(
                              (task) => task.status === "failed"
                            ).length,
                          0
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedGoalInProgressTasks.length > 0 && (
                  <div className="border-t border-gray-400 pt-2 mt-2 mb-2">
                    <div className="mx-2 space-y-1">
                      <div className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3 text-blue-500" />
                        <span className="truncate">
                          {selectedGoalInProgressTasks[0].title}
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
