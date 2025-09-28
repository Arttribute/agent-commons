import { BadgeCent } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function UserLockedTokens() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex items-center p-1 rounded-xl border border-gray-400 gap-1">
          <BadgeCent className="h-4 w-4" />
          <span className="text-sm mr-1">5000</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agent Tokens</DialogTitle>
          <DialogDescription>
            You have 5000 common$ tokens locked in the system. These tokens are
            reserved for future use and cannot be spent at this time.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
