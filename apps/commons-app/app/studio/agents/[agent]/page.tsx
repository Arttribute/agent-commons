"use client";
import { useEffect, useState } from "react";

interface ModelConfig {
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}
import { InteractionInterface } from "@/components/agents/InteractionInterface";
import { Presets } from "@/components/agents/Presets";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FundAgent } from "@/components/agents/FundAgent";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import KnowledgeBaseInput from "@/components/agents/KnowledgeBaseInput";
import AppBar from "@/components/layout/AppBar";
import { Button } from "@/components/ui/button";
import { use } from "react";
import { CommonAgent } from "@/types/agent";
import { Loader2 } from "lucide-react";

/**
 * We expect a URL param: /studio/[agent]
 * The server sends { agent: string }
 */
interface AgentData {
  agentId: string;
  name?: string;
  persona?: string;
  instructions?: string;
  knowledgebase?: string;
  avatar?: string;
  // Additional fields from your schema
}

export default function AgentStudio({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const agentid = use(params);
  const id = agentid.agent;

  const [agent, setAgent] = useState<CommonAgent | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(true);

  const [customTools, setCustomTools] = useState<{ [key: string]: string }>({
    common: "",
    external: "",
  });
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    temperature: agent?.temperature || 0.5,
    maxTokens: agent?.maxTokens || 100,
    stopSequences: agent?.stopSequences || [],
    topP: agent?.topP || 1,
    frequencyPenalty: agent?.frequencyPenalty || 0,
    presencePenalty: agent?.presencePenalty || 0,
  });
  const [isEditing, setIsEditing] = useState(false);

  // Local state for editing fields
  const [editForm, setEditForm] = useState<Partial<AgentData>>({});

  // 1. Fetch agent data from NestJS
  useEffect(() => {
    if (id) {
      fetchAgent();
    }
  }, [id]);

  async function fetchAgent() {
    try {
      setLoadingAgent(true);
      const res = await fetch(`/api/agents/agent?agentId=${id}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch agent details");
      }
      const json = await res.json();
      setAgent(json.data);
      // Initialize edit form with existing data
      setEditForm(json.data);
    } catch (err) {
      console.error("Error fetching agent:", err);
    } finally {
      setLoadingAgent(false);
    }
  }

  // For display: truncated address
  const agentAddress = agent?.agentId || "";
  const formattedAddress =
    agentAddress.length > 20
      ? `${agentAddress.slice(0, 8)}...${agentAddress.slice(-7)}`
      : agentAddress;

  // 2. Handle "Save" to update agent via PUT
  async function handleSaveChanges() {
    if (!agent) return;
    try {
      const res = await fetch(`/api/agents/agent?agentId=${agent.agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        throw new Error("Failed to update agent.");
      }
      const json = await res.json();
      // Update local state
      setAgent(json.data);
      setEditForm(json.data);
      // Switch off edit mode
      setIsEditing(false);
    } catch (err) {
      console.error("Error saving agent updates:", err);
      alert("Error saving changes.");
    }
  }

  return (
    <div>
      <AppBar />
      <div className="grid grid-cols-12 gap-2 mt-16">
        {/* Left Panel */}
        <div className="col-span-3">
          {/* If agent is still loading, show a placeholder */}
          {loadingAgent ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p>Loading agent details...</p>
            </div>
          ) : agent ? (
            <>
              {/* Agent header */}
              <div className="flex items-center">
                <Avatar className="h-12 w-12 m-2">
                  <AvatarImage
                    src={agent.avatar || "https://github.com/shadcn.png"}
                  />
                  <AvatarFallback>
                    {agent?.name?.slice(0, 2).toUpperCase() || "AG"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col justify-center">
                  {!isEditing ? (
                    <h1 className="text-xl font-bold">
                      {agent.name || "Unnamed Agent"}
                    </h1>
                  ) : (
                    <Input
                      value={editForm.name ?? ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      className="text-xl font-bold"
                    />
                  )}
                  <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-3xl w-52">
                    <p className="text-gray-500 text-xs">{formattedAddress}</p>
                  </div>
                </div>
              </div>
              {/* Agent balance + fund button */}
              <div className="grid grid-cols-7 gap-2 m-4 border p-2 rounded-lg">
                <div className="col-span-4 flex items-center">
                  <p className="font-semibold text-gray-800 ml-2">
                    Common$ ...
                  </p>
                </div>
                <div className="col-span-3">
                  {/* Transfer from user's wallet to agent */}
                  <FundAgent />
                </div>
              </div>

              {/* Persona + Instructions */}
              <div className="m-2 border rounded-lg p-2">
                <div className="mb-2">
                  <Label htmlFor="persona">Persona</Label>
                  {!isEditing ? (
                    <Textarea
                      id="persona"
                      value={agent.persona || ""}
                      readOnly
                      placeholder="N/A"
                      className="min-h-[80px]"
                    />
                  ) : (
                    <Textarea
                      id="persona"
                      value={editForm.persona || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          persona: e.target.value,
                        }))
                      }
                      className="min-h-[80px]"
                    />
                  )}
                </div>
                <div>
                  <Label htmlFor="instructions">Instructions</Label>
                  {!isEditing ? (
                    <Textarea
                      id="instructions"
                      value={agent.instructions || ""}
                      readOnly
                      placeholder="N/A"
                      className="h-[80px]"
                    />
                  ) : (
                    <Textarea
                      id="instructions"
                      value={editForm.instructions || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          instructions: e.target.value,
                        }))
                      }
                      className="h-[80px]"
                    />
                  )}
                </div>
              </div>

              {/* KnowledgeBase */}
              <div className="border p-2 rounded-lg m-2">
                <Label htmlFor="knowledgebase">Knowledge Base</Label>
                {!isEditing ? (
                  <KnowledgeBaseInput
                    value={agent.knowledgebase || ""}
                    onChange={() => {}}
                  />
                ) : (
                  <KnowledgeBaseInput
                    value={editForm.knowledgebase || ""}
                    onChange={(value) =>
                      setEditForm((prev) => ({
                        ...prev,
                        knowledgebase: value,
                      }))
                    }
                  />
                )}
              </div>

              {/* Edit / Save buttons */}
              <div className="m-2 flex gap-2">
                {!isEditing ? (
                  <Button variant="outline" onClick={() => setIsEditing(true)}>
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleSaveChanges}>Save</Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setEditForm(agent); // revert changes
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                )}
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
            <Presets
              agent={editForm}
              setAgent={setEditForm}
              customTools={customTools}
              setCustomTools={setCustomTools}
              modelConfig={modelConfig}
              setModelConfig={setModelConfig}
            />
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
