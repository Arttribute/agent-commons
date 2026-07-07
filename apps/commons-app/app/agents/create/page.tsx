"use client";
import { CreateAgentForm } from "@/components/agents/create-agent-form";

export default function Page() {
  return (
    <div className="h-screen overflow-hidden">
      <div className="h-screen overflow-y-auto">
        {/* <h1 className="text-3xl font-bold text-center mb-8">Agent Creator</h1> */}
        <CreateAgentForm />
      </div>
    </div>
  );
}
