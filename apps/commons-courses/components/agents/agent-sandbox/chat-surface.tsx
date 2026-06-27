"use client";

import { Loader2, MessageSquareText, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./types";

type ChatSurfaceProps = {
  messages: ChatMessage[];
  sending: boolean;
  chatInput: string;
  createdAgentId?: string;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export function ChatSurface({
  messages,
  sending,
  chatInput,
  createdAgentId,
  chatEndRef,
  onInputChange,
  onSend,
}: ChatSurfaceProps) {
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-slate-50">
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
              Agent is thinking
            </div>
          ) : null}
          <div ref={chatEndRef} />
        </div>
      </div>
      <div className="border-t border-slate-200 bg-white p-3">
        <div className="mx-auto flex max-w-3xl gap-2">
          <input
            value={chatInput}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={
              createdAgentId
                ? "Message your live agent..."
                : "Create the agent before chatting..."
            }
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!createdAgentId || sending || !chatInput.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
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
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
          assistant
            ? "rounded-bl-md bg-white text-slate-800"
            : "rounded-br-md bg-slate-950 text-white"
        )}
      >
        {assistant ? (
          <div className="mb-1 flex items-center gap-1.5 text-xs font-black text-slate-500">
            <MessageSquareText className="h-3.5 w-3.5" />
            Agent
          </div>
        ) : null}
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
