"use client";

import { FormEvent, useState } from "react";
import { Compass, MessageSquare, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourseAgentMessage, CourseAgentViewContext } from "@/types/course-agent";

type Props = {
  context: CourseAgentViewContext;
};

export function GeneralAgentDrawer({ context }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CourseAgentMessage[]>([]);
  const [loading, setLoading] = useState(false);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
          content: "I could not reach the assistant. Please try again.",
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
        aria-label="Open assistant"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800",
          open && "hidden"
        )}
      >
        <Compass className="h-4 w-4" />
        Assistant
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20">
          <button
            type="button"
            aria-label="Close assistant"
            className="hidden flex-1 md:block"
            onClick={() => setOpen(false)}
          />
          <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  CommonLab assistant
                </p>
                <h2 className="mt-1 text-base font-bold text-slate-950">
                  Navigate your workspace
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close assistant"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="mt-10 text-center">
                  <Compass className="mx-auto mb-3 h-5 w-5 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-800">
                    Ask across what you can access.
                  </p>
                  <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-500">
                    I can help find courses, continue lessons, locate
                    assignments, and navigate your educator or learner work.
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
                  placeholder="Ask where to go or what to find..."
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
