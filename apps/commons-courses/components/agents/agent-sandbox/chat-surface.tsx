"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, Loader2, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./types";

type ChatSurfaceProps = {
  messages: ChatMessage[];
  sending: boolean;
  chatInput: string;
  createdAgentId?: string;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  activityLabel?: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export function ChatSurface({
  messages,
  sending,
  chatInput,
  createdAgentId,
  chatEndRef,
  activityLabel,
  onInputChange,
  onSend,
}: ChatSurfaceProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatEndRef, messages, sending, activityLabel]);

  // Auto-resize the textarea up to ~4 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [chatInput]);

  const isEmpty = messages.length === 0 && !sending;

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white"
      data-sandbox-target="chat"
    >
      {/* Messages / empty state */}
      {isEmpty ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <p className="text-center text-sm text-slate-400">
            {createdAgentId
              ? "Send a message to start chatting with your agent"
              : "Create the agent first, then chat here"}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {messages.map((message, index) => (
              <ChatBubble
                key={`${message.role}-${index}`}
                role={message.role}
                content={message.content}
              />
            ))}
            {sending ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {activityLabel || "Agent is thinking"}
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* Input bar — unified rounded container, no hard border-t */}
      <div className="px-3 pb-3 pt-2">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow focus-within:border-slate-300 focus-within:shadow-md">
            <textarea
              ref={textareaRef}
              data-sandbox-target="chat-input"
              value={chatInput}
              rows={1}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder={
                createdAgentId
                  ? "Message your agent…"
                  : "Create the agent before chatting…"
              }
              className="w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            <div className="flex items-center gap-2 px-3 pb-2.5">
              <button
                type="button"
                className="text-slate-300"
                aria-label="Attach file"
                disabled
                title="File attachments coming soon"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <div className="flex-1" />
              <button
                data-sandbox-target="send-button"
                type="button"
                onClick={onSend}
                disabled={!createdAgentId || sending || !chatInput.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
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
      </div>
    </section>
  );
}

function ChatBubble({ role, content }: ChatMessage) {
  const assistant = role === "assistant";
  return (
    <div className={cn("flex", assistant ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6",
          assistant
            ? "rounded-bl-md bg-slate-100 text-slate-800"
            : "rounded-br-md bg-slate-950 text-white"
        )}
      >
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
