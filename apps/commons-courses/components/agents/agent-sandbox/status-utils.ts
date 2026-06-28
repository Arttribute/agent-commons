import type { SandboxLog } from "./types";

export function formatApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as {
    error?: unknown;
    message?: unknown;
  };
  const error = data.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const details = error as Record<string, unknown>;
    const message =
      typeof details.message === "string" && details.message.trim()
        ? details.message
        : fallback;
    const requestId =
      typeof details.requestId === "string"
        ? ` Request ${details.requestId}.`
        : "";
    const type =
      typeof details.type === "string" ? ` (${details.type})` : "";
    return `${message}${type}.${requestId}`.trim();
  }
  if (typeof data.message === "string") return data.message;
  return fallback;
}

export function logDotClass(level: SandboxLog["level"]) {
  const color =
    level === "error"
      ? "bg-rose-500"
      : level === "warning"
        ? "bg-amber-500"
        : level === "success"
          ? "bg-green-500"
          : "bg-slate-400";
  return `absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white ${color}`;
}
