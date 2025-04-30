"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";

interface Goal {
  goalId: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  progress: number;
}

interface GoalSelectorProps {
  goals: Goal[];
  selectedGoalId: string;
  onSelectGoal: (goalId: string) => void;
}

export default function GoalSelector({
  goals,
  selectedGoalId,
  onSelectGoal,
}: GoalSelectorProps) {
  return (
    <div className="space-y-4">
      <Select value={selectedGoalId} onValueChange={onSelectGoal}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a goal" />
        </SelectTrigger>
        <SelectContent>
          {goals.map((goal) => (
            <SelectItem key={goal.goalId} value={goal.goalId} className="py-2">
              <div className="flex flex-col space-y-1">
                <div className="flex items-center gap-2">
                  {goal.status === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : goal.status === "in_progress" ? (
                    <Clock className="h-4 w-4 text-blue-500" />
                  ) : goal.status === "failed" ? (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-gray-500" />
                  )}
                  <span>{goal.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={goal.progress} className="h-1.5 w-24" />
                  <span className="text-xs text-muted-foreground">
                    {goal.progress}%
                  </span>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
