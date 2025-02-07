import * as React from "react";
import TaskCard from "@/components/tasks/TaskCard";
import { ToolSnapshot } from "@/types/tools";

export default function TasksList({ tasks }: { tasks: ToolSnapshot[] }) {
  return (
    <div className="container grid grid-cols-12 gap-3">
      {tasks &&
        tasks.map((task: ToolSnapshot, index: number) => (
          <div className="col-span-12 lg:col-span-4 " key={index}>
            <TaskCard task={task} />
          </div>
        ))}
    </div>
  );
}
