"use client";
import { AgentForm } from "@/components/agents/CreateAgentForm";
import AppBar from "@/components/layout/AppBar";

export default function Page() {
  return (
    <>
      <AppBar />
      <div className="min-h-screen  mt-16">
        {/* <h1 className="text-3xl font-bold text-center mb-8">Agent Creator</h1> */}
        <AgentForm />
      </div>
    </>
  );
}
