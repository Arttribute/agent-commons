"use client";
import SessionInterface from "@/components/sessions/session-interface";
import AppBar from "@/components/layout/app-bar";
import { SessionsSideBar } from "@/components/sessions/sessions-side-bar";

export default function AgentSessionPage() {
  return (
    <>
      <div className="flex  h-screen bg-gray-50 dark:bg-gray-900">
        <SessionsSideBar username="user" />
        <SessionInterface />
      </div>
    </>
  );
}
