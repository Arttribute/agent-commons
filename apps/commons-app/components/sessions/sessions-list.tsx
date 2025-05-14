"use client";

import type React from "react";
import Link from "next/link";

interface SessionsListProps {
  sessions: any[]; // Replace with actual type
  agentId: string;
}

export default function SessionsList({ sessions, agentId }: SessionsListProps) {
  return (
    <div className="">
      {sessions.map((session) => (
        <Link key={session.id} href={`/agents/${agentId}/${session.id}`}>
          <div
            key={session._id}
            className="p-2  text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md gap-1"
          >
            <p className="text-sm ">{session.title}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
