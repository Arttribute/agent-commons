"use client";
import RandomAvatar from "@/components/account/random-avatar";

export function AgentTitle() {
  return (
    <div className="flex items-center gap-3">
      <RandomAvatar size={30} username={"agent"} />
      <div className="flex flex-col ">
        <h2 className="text-sm font-semibold">Agent name</h2>
        <p className="text-xs text-muted-foreground -mt-1">Agent description</p>
      </div>
    </div>
  );
}
