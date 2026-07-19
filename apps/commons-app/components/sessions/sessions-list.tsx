"use client";

import { MessageSquare } from "lucide-react";
import { SessionItem, type SessionItemData } from "@/components/sessions/session-item";

interface SessionsListProps {
  sessions: SessionItemData[];
  currentSessionId?: string;
  variant?: "sidebar" | "card";
  onSelect?: (sessionId: string) => void;
  onRename?: (sessionId: string, title: string) => Promise<boolean> | boolean;
  onDelete?: (sessionId: string) => Promise<boolean> | boolean;
  emptyLabel?: string;
  /** Live-typing title, provided by the agent workspace only. */
  streamingTitleSessionId?: string | null;
  streamingTitleText?: string;
  /** Sessions with something awaiting the user (e.g. a copilot review). */
  attentionSessionIds?: string[];
}

export default function SessionsList({
  sessions,
  currentSessionId,
  variant = "sidebar",
  onSelect,
  onRename,
  onDelete,
  emptyLabel = "No sessions yet",
  streamingTitleSessionId,
  streamingTitleText = "",
  attentionSessionIds,
}: SessionsListProps) {
  if (sessions.length === 0) {
    return (
      <div className="py-6 text-center">
        <MessageSquare className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className={variant === "card" ? "grid gap-2" : "space-y-0.5"}>
      {sessions.map((session) => (
        <SessionItem
          key={session.sessionId}
          session={session}
          variant={variant}
          isActive={session.sessionId === currentSessionId}
          needsAttention={attentionSessionIds?.includes(session.sessionId)}
          isStreamingTitle={session.sessionId === streamingTitleSessionId}
          streamingTitleText={streamingTitleText}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
