import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

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
}

interface GoalViewProps {
  goal: Goal;
}

export default function GoalView({ goal }: GoalViewProps) {
  return (
    <ScrollArea className="h-full max-h-[calc(100vh-200px)]">
      <Card className="m-3 border-none shadow-none">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg">{goal.title}</CardTitle>
            <Badge
              variant={goal.status === "completed" ? "default" : "secondary"}
            >
              {goal.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{goal.description}</p>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Progress</span>
                <span>{goal.progress}%</span>
              </div>
              <Progress value={goal.progress} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-1">
                <p className="text-muted-foreground">Priority</p>
                <p className="font-medium">{goal.priority}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">
                  {new Date(goal.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </ScrollArea>
  );
}
