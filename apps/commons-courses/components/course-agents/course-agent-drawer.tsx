"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bot, ChevronRight, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { defaultCourseAgents } from "@/lib/course-agent-defaults";
import { cn } from "@/lib/utils";
import type {
  CourseAgentConfig,
  CourseAgentMessage,
  CourseAgentViewContext,
} from "@/types/course-agent";

type Props = {
  courseSlug: string;
  role: "learner" | "educator";
  agents?: CourseAgentConfig[];
  context: CourseAgentViewContext;
};

export function CourseAgentDrawer({
  courseSlug,
  role,
  agents = [],
  context,
}: Props) {
  const configuredAgents = agents.length > 0 ? agents : defaultCourseAgents;
  const availableAgents = useMemo(
    () =>
      configuredAgents.filter(
        (agent) =>
          agent.enabled &&
          (agent.audience === "both" || agent.audience === `${role}s`)
      ),
    [configuredAgents, role]
  );
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState(availableAgents[0]?.id || "");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CourseAgentMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const activeAgent =
    availableAgents.find((agent) => agent.id === agentId) || availableAgents[0];

  if (!activeAgent) return null;

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading || !activeAgent) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/course-agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseSlug,
          agentId: activeAgent.id,
          role,
          message: content,
          messages: nextMessages.slice(-8),
          context,
        }),
      });
      const data = await res.json();
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: res.ok
            ? data.reply
            : data.error || "I could not help with that request.",
        },
      ]);
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "I could not reach the course agent. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open course assistant"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-2 rounded-l-lg border border-r-0 border-slate-200 bg-white px-2.5 py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50",
          open && "translate-x-full"
        )}
      >
        <Bot className="h-4 w-4" />
        <ChevronRight className="h-3.5 w-3.5 rotate-180 text-slate-400" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20">
          <button
            type="button"
            aria-label="Close course assistant"
            className="hidden flex-1 md:block"
            onClick={() => setOpen(false)}
          />
          <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
            <header className="border-b border-slate-100 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Course agent
                  </p>
                  <h2 className="mt-1 text-base font-bold text-slate-950">
                    {activeAgent.name}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close course assistant"
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {availableAgents.length > 1 && (
                <select
                  value={activeAgent.id}
                  onChange={(event) => setAgentId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                >
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              )}
            </header>

            <div className="flex-1 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="mt-10 text-center">
                  <Sparkles className="mx-auto mb-3 h-5 w-5 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-800">
                    Ask from this exact view.
                  </p>
                  <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-500">
                    I can use the current course, page, lesson, and visible
                    workflow context while respecting the agent access policy.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm leading-6",
                        message.role === "user"
                          ? "ml-10 bg-slate-950 text-white"
                          : "mr-10 border border-slate-200 bg-white text-slate-700"
                      )}
                    >
                      {message.content}
                    </div>
                  ))}
                  {loading && (
                    <div className="mr-10 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500">
                      Thinking...
                    </div>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={sendMessage} className="border-t border-slate-100 p-3">
              <div className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-2">
                <MessageSquare className="mt-2 h-4 w-4 flex-shrink-0 text-slate-400" />
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask for help with this page..."
                  rows={2}
                  className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={loading || input.trim().length === 0}
                  aria-label="Send message"
                  className="rounded-md bg-slate-950 p-2 text-white disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
