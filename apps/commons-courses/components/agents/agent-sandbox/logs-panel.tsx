import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SandboxLog } from "./types";

export function LogsPanel({
  logs,
  onClose,
}: {
  logs: SandboxLog[];
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-black">Logs</p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close logs"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {logs.map((log, index) => (
          <div
            key={`${log.message}-${index}`}
            className={cn(
              "rounded-lg px-3 py-2 text-xs leading-5",
              log.level === "success" && "bg-green-50 text-green-800",
              log.level === "warning" && "bg-amber-50 text-amber-800",
              log.level === "error" && "bg-rose-50 text-rose-700",
              log.level === "info" && "bg-slate-50 text-slate-600"
            )}
          >
            {log.message}
          </div>
        ))}
      </div>
    </div>
  );
}
