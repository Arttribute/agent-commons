"use client";
import SessionInterface from "@/components/sessions/session-interface";
import AppBar from "@/components/layout/app-bar";

export default function AgentSessionPage() {
  return (
    <>
      <div className="min-h-screen  ">
        {/* <h1 className="text-3xl font-bold text-center mb-8">Agent Creator</h1> */}
        <SessionInterface />
      </div>
    </>
  );
}
