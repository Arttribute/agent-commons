import {
  CheckCircle2,
  CircleAlert,
  Info,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SandboxLog } from "./types";

export function LogsPanel({
  logs,
  onClose,
  showHeader = true,
}: {
  logs: SandboxLog[];
  onClose?: () => void;
  showHeader?: boolean;
}) {
  const successful = logs.filter((log) => log.level === "success").length;
  const warnings = logs.filter((log) => log.level === "warning").length;
  const errors = logs.filter((log) => log.level === "error").length;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-sandbox-target="logs-panel"
    >
      {showHeader ? (
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
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-4 sm:p-5">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-4">
            <LogStat label="Events" value={logs.length} icon={CircleAlert} />
            <LogStat
              label="Successful"
              value={successful}
              icon={CheckCircle2}
              tone="success"
            />
            <LogStat
              label="Warnings"
              value={warnings}
              icon={TriangleAlert}
              tone="warning"
            />
            <LogStat
              label="Errors"
              value={errors}
              icon={XCircle}
              tone="error"
            />
          </div>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <header className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-medium text-slate-950">
                Activity timeline
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Live events from this learner&apos;s sandbox run.
              </p>
            </header>
            <div className="divide-y divide-slate-100">
              {logs.map((log, index) => {
                const Icon = logIcon(log.level);
                return (
                  <div
                    key={`${log.message}-${index}`}
                    className="grid gap-2 px-4 py-3 sm:grid-cols-[120px_110px_minmax(0,1fr)] sm:items-center"
                  >
                    <span className="text-[11px] text-slate-400">
                      {formatLogTime(log.occurredAt, logs.length - index)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold capitalize",
                        log.level === "success" && "bg-green-50 text-green-700",
                        log.level === "warning" && "bg-amber-50 text-amber-700",
                        log.level === "error" && "bg-rose-50 text-rose-700",
                        log.level === "info" && "bg-slate-100 text-slate-600",
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {log.level}
                    </span>
                    <p className="text-xs leading-5 text-slate-700">
                      {log.message}
                    </p>
                  </div>
                );
              })}
              {!logs.length ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  No sandbox activity yet.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LogStat({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: typeof Info;
  tone?: "neutral" | "success" | "warning" | "error";
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-500",
          tone === "success" && "bg-green-50 text-green-600",
          tone === "warning" && "bg-amber-50 text-amber-600",
          tone === "error" && "bg-rose-50 text-rose-600",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-lg font-medium text-slate-950">
          {value}
        </span>
        <span className="block text-[10px] uppercase tracking-wide text-slate-500">
          {label}
        </span>
      </span>
    </div>
  );
}

function logIcon(level: SandboxLog["level"]) {
  if (level === "success") return CheckCircle2;
  if (level === "warning") return TriangleAlert;
  if (level === "error") return XCircle;
  return Info;
}

function formatLogTime(value: string | undefined, fallback: number) {
  if (!value) return `Event ${String(fallback).padStart(2, "0")}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `Event ${fallback}`;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
