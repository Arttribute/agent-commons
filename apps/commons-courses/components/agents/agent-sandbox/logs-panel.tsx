import { cn } from "@/lib/utils";
import type { SandboxLog } from "./types";

export function LogsPanel({ logs }: { logs: SandboxLog[] }) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-black">Logs</p>
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
