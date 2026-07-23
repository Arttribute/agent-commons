"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, Bot, Gauge, Loader2, Plus } from "lucide-react";
import { RichTextRenderer } from "@/components/rich-text-renderer";
import type { ChatMessage } from "./types";

type ChatSurfaceProps = {
  messages: ChatMessage[];
  sending: boolean;
  chatInput: string;
  createdAgentId?: string;
  agentName?: string;
  brief?: string;
  starters?: string[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  activityLabel?: string;
  placeholder?: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export function ChatSurface({
  messages,
  sending,
  chatInput,
  createdAgentId,
  agentName,
  brief,
  starters = [],
  chatEndRef,
  activityLabel,
  placeholder,
  onInputChange,
  onSend,
}: ChatSurfaceProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = messages.length === 0 && !sending;
  const visibleMessages = messages.filter((message) => message.content.trim());

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatEndRef, messages, sending, activityLabel]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 64), 160)}px`;
    element.style.overflowY = element.scrollHeight > 160 ? "auto" : "hidden";
  }, [chatInput]);

  const composer = (
    <SandboxComposer
      textareaRef={textareaRef}
      value={chatInput}
      created={Boolean(createdAgentId)}
      sending={sending}
      placeholder={placeholder}
      onChange={onInputChange}
      onSend={onSend}
    />
  );

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white"
      data-sandbox-target="chat"
    >
      {isEmpty ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col items-center justify-center px-4 py-8">
            <div className="w-full max-w-[46rem]">
              <div className="mb-6 flex flex-col items-center gap-4 text-center">
                <AgentMark name={agentName} size="lg" />
                <div>
                  <h2 className="text-xl font-normal tracking-tight text-slate-950 sm:text-2xl">
                    {createdAgentId
                      ? "What shall we work on today?"
                      : `Finish setting up ${agentName || "your agent"}`}
                  </h2>
                  {!createdAgentId ? (
                    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                      Create the real Agent Commons agent before starting a live
                      session.
                    </p>
                  ) : brief ? (
                    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                      {plainText(brief)}
                    </p>
                  ) : null}
                </div>
              </div>
              {composer}
              {createdAgentId && starters.length > 0 ? (
                <div className="mt-3 grid w-full grid-cols-1 gap-2 sm:grid-flow-col sm:auto-cols-fr">
                  {starters.slice(0, 4).map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      title={starter}
                      onClick={() => onInputChange(starter)}
                      className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center text-sm text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-950"
                    >
                      <span className="block truncate">{starter}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[46rem] px-4 pb-6 pt-4">
              {visibleMessages.map((message, index) => (
                <ChatMessageRow
                  key={`${message.role}-${index}`}
                  message={message}
                  agentName={agentName}
                  showAgentHeader={
                    message.role === "assistant" &&
                    visibleMessages[index - 1]?.role !== "assistant"
                  }
                />
              ))}
              {sending ? (
                <div className="my-3">
                  <div className="mb-2 flex items-center gap-2">
                    <AgentMark name={agentName} size="sm" />
                    <span className="text-xs text-slate-500">
                      {agentName || "Agent"}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-2 text-[13px] text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="animate-pulse">
                      {activityLabel || "Thinking…"}
                    </span>
                  </span>
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>
          </div>
          <div className="mx-auto w-full max-w-[46rem] shrink-0 px-4 pb-4">
            {composer}
          </div>
        </>
      )}
    </section>
  );
}

function SandboxComposer({
  textareaRef,
  value,
  created,
  sending,
  placeholder,
  onChange,
  onSend,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  created: boolean;
  sending: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="relative rounded-2xl border border-stone-300 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition-colors focus-within:border-stone-400">
      <textarea
        ref={textareaRef}
        data-sandbox-target="chat-input"
        value={value}
        rows={2}
        disabled={!created || sending}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder={
          created
            ? placeholder || "Ask me something..."
            : "Create the agent before chatting…"
        }
        className="h-16 w-full resize-none rounded-2xl bg-transparent p-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
      />
      <div className="flex items-center justify-between px-2 pb-2">
        <button
          type="button"
          disabled
          title="Attachments are not enabled for this lesson"
          aria-label="Add photos and files"
          className="rounded-lg p-1.5 text-slate-400 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled
            title="Thinking level is managed by this lesson"
            className="flex items-center gap-1.5 rounded-lg p-1.5 text-slate-400 disabled:opacity-60"
          >
            <Gauge className="h-4 w-4" />
            <span className="text-xs">Auto</span>
          </button>
          <button
            data-sandbox-target="send-button"
            type="button"
            onClick={onSend}
            disabled={!created || sending || !value.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Send"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatMessageRow({
  message,
  agentName,
  showAgentHeader,
}: {
  message: ChatMessage;
  agentName?: string;
  showAgentHeader: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="my-3 flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-100 px-4 py-2.5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 max-w-none">
      {showAgentHeader ? (
        <div className="mb-2 flex items-center gap-2">
          <AgentMark name={agentName} size="sm" />
          <span className="text-xs text-slate-500">{agentName || "Agent"}</span>
        </div>
      ) : null}
      <RichTextRenderer
        value={message.content}
        className="text-sm leading-relaxed text-slate-800"
      />
    </div>
  );
}

function AgentMark({ name, size }: { name?: string; size: "sm" | "lg" }) {
  return (
    <span
      className={
        size === "lg"
          ? "flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700"
          : "flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600"
      }
      title={name || "Agent"}
    >
      <Bot className={size === "lg" ? "h-5 w-5" : "h-3 w-3"} />
    </span>
  );
}

function plainText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
