import * as React from "react";
import { ChartNoAxesColumn } from "lucide-react";
import { ToolSnapshot } from "@/types/tools";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function TaskCard({ task }: { task: ToolSnapshot }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="bg-white border rounded-lg shadow-lg p-4">
          <p className="font-semibold">{task.name}</p>

          <p className="text-sm text-gray-500 runcate w-full overflow-hidden whitespace-nowrap text-ellipsis">
            {task.description}
          </p>
          <div className="flex justify-between items-center mt-4">
            <div className="flex items-center text-gray-500">
              <ChartNoAxesColumn className="h-4 w-4" />
              <p className="text-sm ml-1">{task.calls}</p>
            </div>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task.name}</DialogTitle>
          <DialogDescription>
            View the details of the task below.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="submit">Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
