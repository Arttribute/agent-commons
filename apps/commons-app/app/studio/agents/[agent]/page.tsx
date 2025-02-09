"use client";
import { useEffect, useState } from "react";
import { use } from "react";

// UI Components
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";

// Local Components
import AppBar from "@/components/layout/AppBar";
import KnowledgeBaseInput from "@/components/agents/KnowledgeBaseInput";
import { InteractionInterface } from "@/components/agents/InteractionInterface";
import { Presets } from "@/components/agents/Presets";
import { FundAgent } from "@/components/agents/FundAgent";
import { EIP1193Provider, usePrivy, useWallets } from "@privy-io/react-auth"; // or your method of obtaining a provider

// Hooks
import { useChainClients } from "@/hooks/useChainClients";
// import { useWalletProvider } from "@/hooks/useWalletProvider"; // Ensure this path is correct or comment it out if not needed
import { useCommonToken } from "@/hooks/useCommonToken";

// Types
import { CommonAgent } from "@/types/agent";

interface ModelConfig {
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

interface AgentData {
  agentId: string;
  name?: string;
  persona?: string;
  instructions?: string;
  knowledgebase?: string;
  avatar?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
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
  const [agentBalance, setAgentBalance] = useState<bigint>(0n);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<AgentData>>({});

  const [customTools, setCustomTools] = useState<{ [key: string]: string }>({
    common: "",
    external: "",
  });
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    temperature: 0.5,
    maxTokens: 100,
    stopSequences: [],
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  });

  // Get the provider using your custom hook
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const { wallets } = useWallets();
  useEffect(() => {
    if (!wallets || wallets.length === 0) {
      console.log("No wallets available. User may not be signed in.");
      return;
    }
    wallets[0]
      .getEthereumProvider()
      .then((prov) => {
        console.log("Obtained provider:", prov);
        setProvider(prov);
      })
      .catch((err) => {
        console.error("Error getting Ethereum provider:", err);
      });
  }, [wallets]);

  // Pass the provider to useChainClients
  const { publicClient, walletClient } = useChainClients(provider);
  const { balanceOf } = useCommonToken(publicClient, walletClient);

  // 1. Fetch agent data from your backend
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
      setEditForm(json.data);
    } catch (err) {
      console.error("Error fetching agent:", err);
    } finally {
      setLoadingAgent(false);
    }
  }

  // 2. Fetch the agent's Common$ balance (public call)
  useEffect(() => {
    if (!agent?.agentId) return;
    balanceOf(agent.agentId as `0x${string}`).then(setAgentBalance);
  }, [agent?.agentId, balanceOf]);

  const agentAddress = agent?.agentId || "";
  const formattedAddress =
    agentAddress.length > 20
      ? `${agentAddress.slice(0, 8)}...${agentAddress.slice(-7)}`
      : agentAddress;

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
      setAgent(json.data);
      setEditForm(json.data);
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
          {loadingAgent ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p>Loading agent details...</p>
            </div>
          ) : agent ? (
            <>
              {/* Agent Header */}
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
                <div className="col-span-4 flex flex-col justify-center">
                  <p className="font-semibold text-gray-800 ml-2">
                    Common$:{" "}
                    <span className="text-blue-700">
                      {(Number(agentBalance) / 1e18).toFixed(4)}
                    </span>
                  </p>
                </div>
                <div className="col-span-3">
                  <FundAgent
                    agentAddress={agent.agentId as `0x${string}`}
                    onFundSuccess={() => {
                      if (agent?.agentId) {
                        balanceOf(agent.agentId as `0x${string}`).then(
                          setAgentBalance
                        );
                      }
                    }}
                  />
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

              {/* Edit / Save Buttons */}
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
                        setEditForm(agent);
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
