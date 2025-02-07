import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BadgePlus } from "lucide-react";
import { ToolForm } from "./ToolForm";

export function CreateTool() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          {" "}
          <BadgePlus />
          <p className="text-sm -ml-1">Create Tool</p>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Tool</DialogTitle>
          <DialogDescription>
            Fill in the details below to create a new tool.
          </DialogDescription>
        </DialogHeader>

        <ToolForm />

        <DialogFooter>
          <Button type="submit">Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
