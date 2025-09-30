"use client";

import { cn } from "@/lib/utils";
import type { AgentLog } from "@/components/logs/logs-display";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";

interface LogItemProps {
  log: AgentLog;
  isSelected: boolean;
  onClick: () => void;
}

// Update the LogItem component to display the session ID
export function LogItem({ log, isSelected, onClick }: LogItemProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "warning":
        return <Clock className="h-4 w-4 text-amber-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "success":
        return "text-green-600";
      case "warning":
        return "text-amber-600";
      case "error":
        return "text-red-600";
      default:
        return "";
    }
  };

  return (
    <div
      className={cn(
        "flex items-center p-2 border-b cursor-pointer hover:bg-muted/50 transition-colors",
        isSelected && "bg-muted"
      )}
      onClick={onClick}
    >
      <div className="w-2/5 truncate pr-4">
        <div className="text-sm font-medium truncate">{log.action}</div>
        <div className="text-xs text-muted-foreground truncate">
          {log.message}
        </div>
      </div>
      <div className="w-1/5 text-sm font-mono">{log.session_id}</div>
      <div className="w-1/5 flex items-center gap-1.5">
        {getStatusIcon(log.status || "")}
        <span
          className={cn(
            "capitalize text-sm font-medium",
            getStatusText(log.status || "")
          )}
        >
          {log.status}
        </span>
      </div>
      <div className="w-1/5 text-sm text-muted-foreground">
        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
      </div>
    </div>
  );
}
