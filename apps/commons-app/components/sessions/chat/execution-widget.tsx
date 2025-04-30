"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Maximize2,
  Minimize2,
  CheckCircle2,
  Cog,
  Clock,
  CircleDashed,
  CircleDot,
  CircleAlert,
  X,
  CircleCheckBig,
} from "lucide-react";
import { cn } from "@/lib/utils";
import RightPanel from "./right-panel";
import GoalSelector from "@/components/sessions/goals/goal-selector";

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
  tasks: any[];
}

interface ExecutionWidgetProps {
  goals: Goal[];
  selectedGoal: Goal | null;
  selectedGoalId: string;
  setSelectedGoalId: (goalId: string) => void;
}

export default function ExecutionWidget({
  goals,
  selectedGoal,
  selectedGoalId,
  setSelectedGoalId,
}: ExecutionWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

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

  return (
    <AnimatePresence>
      <motion.div
        className={cn(
          "fixed bottom-4 right-4 z-50 flex flex-col",
          isExpanded ? "w-[600px] h-[600px]" : "w-auto"
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {isExpanded ? (
          <motion.div
            className="bg-white dark:bg-gray-950 rounded-lg shadow-lg border overflow-hidden flex flex-col h-full max-h-[600px]"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <div className="p-3 border-b flex justify-between items-center bg-gray-50 dark:bg-gray-900">
              <h3 className="font-medium">Agent Execution</h3>
              <div className="flex gap-1">
                <button
                  onClick={toggleExpanded}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded"
                >
                  <Minimize2 className="h-4 w-4 text-gray-500 hover:text-gray-700 cursor-pointer" />
                </button>
              </div>
            </div>
            <div className="p-3 border-b">
              <GoalSelector
                goals={goals}
                selectedGoalId={selectedGoalId}
                onSelectGoal={setSelectedGoalId}
              />
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              <RightPanel
                goal={selectedGoal}
                className="flex-1 overflow-auto"
              />
            </div>
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
                  <div className="flex items-center gap-2 font-semibold">
                    <span>Agent execution</span>
                  </div>

                  <div className="ml-auto p-0.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded">
                    <Maximize2 className="h-4 w-4 text-gray-500 hover:text-gray-700 cursor-pointer" />
                  </div>
                </div>
              </div>
            </button>

            <div className=" max-h-[200px] overflow-auto">
              <div className="border border-gray-400  rounded-lg m-1">
                <div className="mx-2 mt-1 space-y-1 ">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Tasks:</span>
                    <span className="font-medium">{totalTasks}</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Overall Progress:</span>
                      <span>
                        {Math.round(
                          goals.reduce((acc, goal) => acc + goal.progress, 0) /
                            goals.length
                        )}
                        %
                      </span>
                    </div>

                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                      <div
                        className="bg-indigo-500 h-1 rounded-full"
                        style={{
                          width: `${Math.round(goals.reduce((acc, goal) => acc + goal.progress, 0) / goals.length)}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-center text-xs mt-1">
                    <div className="flex items-center  dark:bg-green-900/20 p-1 rounded gap-1">
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
                  <div className="border-t pt-2 mt-2 mb-2">
                    <div className="mx-2 space-y-1 ">
                      <div className="text-xs font-medium text-gray-500">
                        Current task:
                      </div>
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
