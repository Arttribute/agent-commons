"use client";

import { useMemo, useState } from "react";
import { Bot, MessageSquare, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SandboxSession } from "./types";

export function SessionsSurface({
  sessions,
  currentSessionId,
  onCreate,
  onSelect,
}: {
  sessions: SandboxSession[];
  currentSessionId?: string;
  onCreate: () => void;
  onSelect: (session: SandboxSession) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(normalized) ||
        session.messages.some((message) =>
          message.content.toLowerCase().includes(normalized),
        ),
    );
  }, [query, sessions]);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-slate-200 px-5 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-medium tracking-tight text-slate-950">
              Sessions
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Reopen a learner test session or start with a clean conversation.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>
        <label className="relative mt-3 block max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions"
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-2 px-5 py-5">
          {filtered.length ? (
            filtered.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors",
                  session.id === currentSessionId
                    ? "border-slate-300 bg-slate-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60",
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <Bot className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-950">
                      {session.title || "New session"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {session.messages.length} message
                      {session.messages.length === 1 ? "" : "s"} ·{" "}
                      {formatSessionDate(session.updatedAt)}
                    </span>
                  </span>
                </span>
                {session.id === currentSessionId ? (
                  <span className="ml-3 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                ) : null}
              </button>
            ))
          ) : (
            <div className="py-12 text-center">
              <MessageSquare className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              <p className="text-sm text-slate-500">
                {query ? "No sessions match your search." : "No sessions yet."}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatSessionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
