"use client";
import RandomAvatar from "@/components/account/random-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CopyIcon } from "lucide-react";

export function AgentTitleCard() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex items-center gap-2 cursor-pointer">
          <RandomAvatar size={30} username={"agent"} />
          <div className="flex flex-col ">
            <h2 className="text-sm font-semibold">Agent name</h2>
            <p className="text-xs text-muted-foreground -mt-1">
              Agent description
            </p>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-3">
              <RandomAvatar size={52} username={"agent"} />
              <div className="flex flex-col ">
                <h2 className="">Agent name</h2>
                <div className="flex items-center mt-1 py-1 px-2 rounded-xl border border-gray-400 w-40">
                  <p className="text-xs text-muted-foreground">
                    0x6d51af...cb54eb6
                  </p>
                  <button className="ml-auto p-0.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded">
                    <CopyIcon className="h-3 w-3 text-gray-500 hover:text-gray-700 " />
                  </button>
                </div>
              </div>
            </div>
          </DialogTitle>
          <DialogDescription>
            Agent description that people will be soon able to edit. This is a
            placeholder text. Lorem ipsum dolor sit amet, consectetur
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
