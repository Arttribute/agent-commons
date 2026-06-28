"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, Loader2, Paperclip } from "lucide-react";
import { RichTextRenderer } from "@/components/rich-text-renderer";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./types";

type ChatSurfaceProps = {
  messages: ChatMessage[];
  sending: boolean;
  chatInput: string;
  createdAgentId?: string;
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
  chatEndRef,
  activityLabel,
  placeholder,
  onInputChange,
  onSend,
}: ChatSurfaceProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatEndRef, messages, sending, activityLabel]);

  // Auto-resize: grow up to ~4 lines (~120px), then scroll
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 120);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > 120 ? "auto" : "hidden";
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

      {/* Input bar — single row when short, grows upward when multiline */}
      <div className="px-3 pb-3 pt-2">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-shadow focus-within:border-slate-300 focus-within:shadow-md">
            {/* Attachment button — same box size as send for aligned bottoms */}
            <button
              type="button"
              disabled
              title="File attachments coming soon"
              aria-label="Attach file"
              className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-300"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {/* Auto-resizing textarea — starts as a single line */}
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
                  ? placeholder || "Message your agent..."
                  : "Create the agent before chatting…"
              }
              className="flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />

            {/* Send button */}
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
        {assistant ? (
          <RichTextRenderer
            value={content}
            className="text-sm leading-6 text-slate-800"
          />
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  );
}
