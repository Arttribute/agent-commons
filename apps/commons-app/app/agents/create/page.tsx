"use client";

import { useState } from "react";
import { AgentForm } from "@/components/agents/CreateAgentForm";
import { AIAgentBuilder } from "@/components/agents/AgentBuilder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Brain } from "lucide-react";
import AppBar from "@/components/layout/AppBar";
import App from "next/app";

export default function Page() {
  const [activeTab, setActiveTab] = useState<"manual" | "ai">("manual");

  return (
    <>
      <AppBar />
      <div className="min-h-screen  mt-16">
        {/* <h1 className="text-3xl font-bold text-center mb-8">Agent Creator</h1> */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "manual" | "ai")}
          className="max-w-lg mx-auto"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Manual Builder
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              AI-Powered Builder
            </TabsTrigger>
          </TabsList>
          <TabsContent value="manual">
            <AgentForm />
          </TabsContent>
          <TabsContent value="ai">
            <AIAgentBuilder />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
