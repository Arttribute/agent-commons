"use client";
import { useEffect, useState } from "react";
import { InteractionInterface } from "@/components/agents/InteractionInterface";
import { Presets } from "@/components/agents/Presets";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FundAgent } from "@/components/agents/FundAgent";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import KnowledgeBaseInput from "@/components/agents/KnowledgeBaseInput";
import AppBar from "@/components/layout/AppBar";
import { use } from "react";

interface AgentData {
  agentId: string;
  name?: string;
  persona?: string;
  instructions?: string;
  knowledgebase?: string;
  // any other fields from your Drizzle schema
}

export default function AgentStudio({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const agentid = use(params);
  const id = agentid.agent;

  const [agent, setAgent] = useState<AgentData | null>(null);

  const [loadingAgent, setLoadingAgent] = useState(true);

  // 1. Fetch agent data from NestJS
  useEffect(() => {
    if (id) {
      fetchAgent();
    }
  }, [id]);
  async function fetchAgent() {
    try {
      setLoadingAgent(true);
      const res = await fetch(`/api/agents/agent?agentId=${id}`);
      if (!res.ok) {
        throw new Error("Failed to fetch agent details");
      }
      const json = await res.json();
      setAgent(json.data);
    } catch (err) {
      console.error("Error fetching agent:", err);
    } finally {
      setLoadingAgent(false);
    }
  }

  // For display: truncated address
  const agentAddress = agent?.agentId || "";
  const formattedAddress =
    agentAddress && agentAddress.length > 20
      ? `${agentAddress.slice(0, 8)}...${agentAddress.slice(-7)}`
      : agentAddress;

  return (
    <div>
      <AppBar />
      <div className="grid grid-cols-12 gap-2 mt-16">
        {/* Left Panel */}
        <div className="col-span-3">
          {/* If agent is still loading, show a placeholder */}
          {loadingAgent ? (
            <div className="m-4">
              <p>Loading agent details...</p>
            </div>
          ) : agent ? (
            <>
              {/* Agent header */}
              <div className="flex">
                <Avatar className="h-12 w-12 m-2">
                  {/* If you have profileImage in agent, use that, else fallback */}
                  <AvatarImage src="https://github.com/shadcn.png" />
                  <AvatarFallback>
                    {agent?.name?.slice(0, 2).toUpperCase() || "AG"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col justify-center">
                  <h1 className="text-xl font-bold">
                    {agent.name || "Unnamed Agent"}
                  </h1>
                  <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-3xl w-52">
                    <p className="text-gray-500 text-xs">{formattedAddress}</p>
                  </div>
                </div>
              </div>
              {/* Agent balance + fund button */}
              <div className="grid grid-cols-7 gap-2 m-4 border p-2 rounded-lg">
                <div className="col-span-4 flex items-center">
                  <p className="font-semibold text-gray-800 ml-2">
                    Common$ {0}
                  </p>
                </div>
                <div className="col-span-3">
                  {/* Transfer from user's wallet to agent */}
                  <FundAgent />
                </div>
              </div>

              {/* Persona + Instructions */}
              <div className="m-2 border rounded-lg">
                <div className="m-2">
                  <Label htmlFor="persona">Persona</Label>
                  <Textarea
                    id="persona"
                    value={agent.persona || ""}
                    readOnly
                    placeholder="N/A"
                    className="min-h-[80px]"
                  />
                </div>
                <div className="m-2">
                  <Label htmlFor="instruction">Instructions</Label>
                  <Textarea
                    id="instruction"
                    value={agent.instructions || ""}
                    readOnly
                    placeholder="N/A"
                    className="h-[80px]"
                  />
                </div>
              </div>

              {/* KnowledgeBase */}
              <div className="border p-2 rounded-lg m-2">
                <Label htmlFor="knowledgebase">Knowledge Base</Label>
                <KnowledgeBaseInput
                  value={agent.knowledgebase || ""}
                  onChange={() => {}}
                />
              </div>
            </>
          ) : (
            <div className="m-4">
              <p>Agent not found.</p>
            </div>
          )}
        </div>

        {/* Interaction Panel */}
        <div className="col-span-6 my-2">
          {/* Pass the agentId to the InteractionInterface for runAgent calls */}
          {agent ? (
            <InteractionInterface agentId={agent.agentId} />
          ) : (
            <div className="p-12 text-center">
              {!loadingAgent && <p>No agent loaded.</p>}
            </div>
          )}
        </div>

        {/* Right Panel (Presets, etc.) */}
        <div className="col-span-3">
          <ScrollArea className="h-[90vh] border p-3 my-2 mr-2 rounded-lg">
            <Presets />
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
