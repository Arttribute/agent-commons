"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Bot,
  Brain,
  ChevronRight,
  Compass,
  MessageSquarePlus,
  LoaderCircle,
  Settings2,
  Send,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { defaultCourseAgents } from "@/lib/course-agent-defaults";
import { cn } from "@/lib/utils";
import { LearnerProfileDialog } from "@/components/learning/learner-profile-dialog";
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
  aboveFooter?: boolean;
};

export function CourseAgentDrawer({
  courseSlug,
  role,
  agents = [],
  context,
  aboveFooter = false,
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
  const [profileOpen, setProfileOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const [agentId, setAgentId] = useState(availableAgents[0]?.id || "");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CourseAgentMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const activeAgent =
    availableAgents.find((agent) => agent.id === agentId) || availableAgents[0];

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    return () => { launcherRef.current?.focus(); };
  }, [open]);
  useEffect(() => {
    const container = conversationRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, loading]);

  if (!activeAgent) return null;

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content) return;
    await sendContent(content);
  }

  async function sendContent(content: string) {
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
      {!open ? (
        <button
          ref={launcherRef}
          type="button"
          aria-label={role === "learner" ? "Open learning copilot" : "Open course assistant"}
          aria-expanded={false}
          aria-controls="course-copilot-panel"
          title={role === "learner" ? "Learning copilot" : "Course assistant"}
          onClick={() => setOpen(true)}
          className="fixed right-5 z-40 rounded-full border border-slate-200 bg-white p-1 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-500"
          style={{ bottom: `calc(${aboveFooter ? "5rem" : "1.25rem"} + env(safe-area-inset-bottom))` }}
        >
          {role === "learner" ? <LearnerCopilotAvatar size={52} /> : <Bot className="m-3 h-7 w-7 text-slate-700" />}
          <span className="absolute -left-1 -top-1 rounded-full bg-slate-950 p-1 text-white shadow" aria-hidden="true">
            <Sparkles className="h-3 w-3" />
          </span>
        </button>
      ) : (
        <aside
          id="course-copilot-panel"
          role="dialog"
          aria-label={role === "learner" ? "Learning copilot" : "Course assistant"}
          aria-modal={false}
          className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-slate-200 bg-white text-slate-950 shadow-xl sm:w-[380px]"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented && (event.target as HTMLElement).closest('[role="dialog"]') === event.currentTarget) {
              event.preventDefault(); setOpen(false);
            }
          }}
        >
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-3">
            {role === "learner" ? <LearnerCopilotAvatar size={34} /> : <Bot className="h-7 w-7 text-slate-500" />}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-medium">{role === "learner" ? "Learning copilot" : activeAgent.name}</h2>
              <p className="mt-0.5 truncate text-[11px] text-slate-500" title={context.title}>{context.title || "Help with this course"}</p>
            </div>
            {role === "learner" ? (
              <button type="button" onClick={() => setProfileOpen(true)} aria-label="Personalize my guidance" title="Personalize my guidance" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <Settings2 className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              aria-label="New chat"
              title="New chat"
              disabled={loading}
              onClick={() => { setMessages([]); setInput(""); inputRef.current?.focus(); }}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-35"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Close copilot" title="Close copilot" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </header>
          {availableAgents.length > 1 ? (
            <div className="border-b border-slate-100 px-3 py-2">
              <select aria-label="Course assistant" value={activeAgent.id} disabled={loading} onChange={(event) => setAgentId(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                {availableAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </div>
          ) : null}
          <div ref={conversationRef} role="log" aria-label="Copilot conversation" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center py-6 text-center">
                {role === "learner" ? <LearnerCopilotAvatar size={96} /> : <Sparkles className="mb-3 h-6 w-6 text-slate-400" />}
                <p className="mt-4 text-base font-medium">{role === "learner" ? "Let’s work through this together." : "Ask from this exact view."}</p>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">{role === "learner" ? "Ask about this activity, practise an idea, or find your next step." : "Ask for help with the course and what’s on this page."}</p>
                {role === "learner" ? (
                  <div className="mt-5 grid w-full gap-2 text-left">
                    <Starter icon={Brain} label="Check my understanding" onClick={() => sendContent("Check my understanding of this lesson. Ask me one question at a time and use hints before explaining.")} />
                    <Starter icon={Target} label="Help me practise" onClick={() => sendContent("Give me a small, ungraded practice step for the idea on this page, then wait for my attempt.")} />
                    <Starter icon={Compass} label="What should I do next?" onClick={() => sendContent("Based on this lesson and my progress, guide me to the most useful next step.")} />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={cn("whitespace-pre-wrap rounded-xl px-3 py-2.5 text-sm leading-6", message.role === "user" ? "ml-7 bg-slate-950 text-white" : "mr-5 bg-slate-50 text-slate-700")}>
                    {message.content}
                  </div>
                ))}
                {loading ? <div className="flex items-center gap-2 px-2 text-xs text-slate-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Thinking…</div> : null}
              </div>
            )}
          </div>
          <form onSubmit={sendMessage} className="shrink-0 border-t border-slate-200 bg-white px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 focus-within:border-slate-400">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault(); void sendContent(input.trim());
                  }
                }}
                aria-label="Message your copilot"
                placeholder="Ask your copilot…"
                rows={2}
                className="max-h-28 min-h-10 min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400"
              />
              <button type="submit" disabled={loading || input.trim().length === 0} aria-label="Send message" className="rounded-lg bg-slate-950 p-2 text-white disabled:opacity-35"><Send className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">Enter to send · Shift + Enter for a new line</p>
          </form>
        </aside>
      )}
      {role === "learner" ? <LearnerProfileDialog controlledOpen={profileOpen} onControlledOpenChange={setProfileOpen} showTrigger={false} /> : null}
    </>
  );
}

function LearnerCopilotAvatar({ size }: { size: number }) {
  return <Image src="/learner-copilot-mascot.png" alt="" width={size} height={size} className="shrink-0 rounded-full bg-white object-contain" />;
}

function Starter({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Brain;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
    >
      <Icon className="h-4 w-4 text-slate-400" />
      {label}
      <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300" />
    </button>
  );
}
