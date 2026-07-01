"use client";
import { CreateAgentForm } from "@/components/agents/create-agent-form";
import AppBar from "@/components/layout/app-bar";

export default function Page() {
  return (
    <div className="h-screen overflow-hidden">
      <AppBar />
      <div className="h-[calc(100vh-80px)] mt-20 overflow-y-auto">
        {/* <h1 className="text-3xl font-bold text-center mb-8">Agent Creator</h1> */}
        <CreateAgentForm />
      </div>
    </div>
  );
}
