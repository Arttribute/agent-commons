"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react";

interface Session {
  sessionId: string;
  agentId: string;
  title?: string;
  createdAt?: string;
}

interface SessionsListProps {
  sessions: Session[];
  currentSessionId?: string;
}

export default function SessionsList({ sessions, currentSessionId }: SessionsListProps) {
  if (sessions.length === 0) {
    return (
      <div className="py-6 text-center">
        <MessageSquare className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">No sessions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {sessions.map((session) => {
        const isActive = session.sessionId === currentSessionId;
        const timeAgo = session.createdAt
          ? formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })
          : null;

        return (
          <Link
            key={session.sessionId}
            href={`/agents/${session.agentId}/${session.sessionId}`}
          >
            <div
              className={cn(
                "group px-2 py-2 rounded-md cursor-pointer transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <p className="text-sm truncate w-full font-medium leading-tight">
                {session.title || "New session"}
              </p>
              {timeAgo && (
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {timeAgo}
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
