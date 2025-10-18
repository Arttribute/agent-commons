"use client";
import { CreateAgentForm } from "@/components/agents/create-agent-form";
import AppBar from "@/components/layout/app-bar";

export default function Page() {
  return (
    <>
      <AppBar />
      <div className="min-h-screen  mt-20">
        {/* <h1 className="text-3xl font-bold text-center mb-8">Agent Creator</h1> */}
        <CreateAgentForm />
      </div>
    </>
  );
}
