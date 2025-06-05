"use client";

import type React from "react";
import Link from "next/link";

interface SessionsListProps {
  sessions: any[]; // Replace with actual type
}

export default function SessionsList({ sessions }: SessionsListProps) {
  return (
    <div className="">
      {sessions.map((session) => (
        <Link
          key={session.sessionId}
          href={`/agents/${session.agentId}/${session.sessionId}`}
        >
          <div
            key={session._id}
            className="p-2  text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md gap-1"
          >
            <p className="text-sm truncate w-48">
              {session.title || "New session"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
