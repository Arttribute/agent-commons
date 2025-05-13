"use client";

import { useEffect, useState, useRef } from "react";
import { use } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";

// Layout & local components
import AppBar from "@/components/layout/app-bar";
import { InteractionInterface } from "@/components/agents/InteractionInterface";
import { Presets } from "@/components/agents/presets";
import { FundAgent } from "@/components/agents/FundAgent";
import RandomAvatar from "@/components/account/random-avatar";
import AgentFinances from "@/components/finances/agent-finances";
import AgentTools from "@/components/tools/agent-tools";
import AgentIdentity from "@/components/agents/agent-identity";
import SessionInterface from "@/components/sessions/session-interface";

// Hooks
import { EIP1193Provider, useWallets } from "@privy-io/react-auth";
import { useChainClients } from "@/hooks/useChainClients";
import { useCommonToken } from "@/hooks/useCommonToken";
import { useAuth } from "@/context/AuthContext";

// Types
import { CommonAgent } from "@/types/agent";

/** The model config shape you already use */
interface ModelConfig {
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

/** The main agent fields (subset) */
interface AgentData {
  agentId: string;
  name?: string;
  persona?: string;
  instructions?: string;
  knowledgebase?: string;
  avatar?: string;
  // If you store the arrays in your DB:
  common_tools?: string[];
  external_tools?: string[];

  // Model hyperparams
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

const DEBOUNCE_DELAY = 1500; // 1.5 sec inactivity before auto-save

export default function AgentStudio({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  // 1) Basic Setup
  const agentid = use(params);
  console.log("Agent ID:", agentid);
  const id = agentid.agent;

  const [agent, setAgent] = useState<CommonAgent | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [agentBalance, setAgentBalance] = useState<bigint>(0n);

  // Controls whether the user is editing
  const [isEditing, setIsEditing] = useState(false);

  /**
   * The "editForm" holds the data we want to edit, including tool arrays and other fields.
   * On load, we set it to the fetched agent's data.
   * On changes, we update it. We'll do auto-save on a debounce.
   */
  const [editForm, setEditForm] = useState<Partial<AgentData>>({});

  // For custom JSON additions (still stored in your final PUT if you wish)
  const [customTools, setCustomTools] = useState<{ [key: string]: string }>({
    common: "",
    external: "",
  });

  // The model config (temp, tokens, etc.)
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    temperature: 0.5,
    maxTokens: 100,
    stopSequences: [],
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  });

  // Wallet / Auth
  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";

  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const { wallets } = useWallets();
  useEffect(() => {
    if (!wallets || wallets.length === 0) {
      return;
    }
    wallets[0]
      .getEthereumProvider()
      .then((prov) => setProvider(prov))
      .catch((err) => console.error("Error getting Ethereum provider:", err));
  }, [wallets]);

  const { publicClient, walletClient } = useChainClients(provider);
  const { balanceOf } = useCommonToken(publicClient, walletClient);

  // 2) Fetch agent data from your backend
  useEffect(() => {
    if (id) {
      fetchAgent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Initialize editForm with the loaded agent data
      setEditForm(json.data);
      // Also initialize model config if your agent stores it:
      setModelConfig((prev) => ({
        ...prev,
        temperature: json.data.temperature ?? prev.temperature,
        maxTokens: json.data.maxTokens ?? prev.maxTokens,
        stopSequences: json.data.stopSequence ?? prev.stopSequences,
        topP: json.data.topP ?? prev.topP,
        frequencyPenalty: json.data.frequencyPenalty ?? prev.frequencyPenalty,
        presencePenalty: json.data.presencePenalty ?? prev.presencePenalty,
      }));
    } catch (err) {
      console.error("Error fetching agent:", err);
    } finally {
      setLoadingAgent(false);
    }
  }

  // 3) Fetch the agent's Common$ balance
  useEffect(() => {
    if (!id) return;
    balanceOf(id as `0x${string}`).then(setAgentBalance);
  }, [id, balanceOf]);

  const agentAddress = id || "";
  const formattedAddress =
    agentAddress.length > 20
      ? `${agentAddress.slice(0, 8)}...${agentAddress.slice(-7)}`
      : agentAddress;

  /**
   * 4) The function that actually sends changes to the server.
   * We'll call it from "auto-save" or from "Save" button.
   */
  async function updateAgentInDB() {
    if (!agent) return; // no agent loaded
    try {
      // Build the final updated data
      const updated: Partial<AgentData> = {
        ...editForm,
        // Merge your modelConfig into the agent if desired
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
        stopSequences: modelConfig.stopSequences,
        topP: modelConfig.topP,
        frequencyPenalty: modelConfig.frequencyPenalty,
        presencePenalty: modelConfig.presencePenalty,
      };

      const res = await fetch(`/api/agents/agent?agentId=${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        throw new Error("Failed to update agent.");
      }
      const json = await res.json();
      // The returned "json.data" should be the updated agent
      setAgent(json.data);
      setEditForm(json.data); // refresh local form state
      return json.data;
    } catch (err) {
      console.error("Error saving agent updates:", err);
      // In production, you might show a toast or something
    }
  }

  /**
   * 5) Manual "Save" button handler that also exits edit mode
   */
  async function handleSaveChanges() {
    await updateAgentInDB();
    setIsEditing(false);
  }

  /**
   * 6) AUTO-SAVE HOOKS (Debounce approach)
   * We watch for changes to `editForm`, `modelConfig`, or `customTools`.
   * After the user is idle for DEBOUNCE_DELAY ms, we call updateAgentInDB().
   */
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(
    null
  );

  // This schedules a call to "updateAgentInDB" after DEBOUNCE_DELAY
  function scheduleAutoSave() {
    // If the user is not in editing mode, skip
    if (!isEditing) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => {
      updateAgentInDB();
    }, DEBOUNCE_DELAY);
    setDebounceTimer(timer);
  }

  // If you want to watch changes in `editForm`, `customTools`, *and* `modelConfig`,
  // you can build a single object that merges them, or just watch them individually:
  useEffect(() => {
    scheduleAutoSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editForm, modelConfig, customTools]);

  // If we exit editing mode, clear any pending timer so we don't send an update
  useEffect(() => {
    if (!isEditing && debounceTimer) {
      clearTimeout(debounceTimer);
    }
  }, [isEditing, debounceTimer]);

  // 7) Render
  return (
    <div>
      <AppBar />

      <div className="grid grid-cols-9 gap-2 mt-12 bg-gray-50">
        {/* Left Panel */}
        <div className="col-span-2 bg-white border-r border-gray-400 ">
          {loadingAgent ? (
            <div className="flex items-center justify-center h-32 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p>Loading agent details...</p>
            </div>
          ) : agent ? (
            <>
              {/* Agent Header */}
              {/* <div className="flex items-center p-3 pb-0 gap-2">
                <Avatar className="h-12 w-12 ">
                  <AvatarImage src={agent.avatar} />
                  <AvatarFallback>
                    <RandomAvatar username={id} size={52} />
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
              </div> */}

              {/* Agent balance + fund button */}
              {/* <div className="grid grid-cols-7 gap-2 m-4 border p-2 rounded-lg">
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
                    agentAddress={id as `0x${string}`}
                    onFundSuccess={() => {
                      if (agent?.agentId) {
                        balanceOf(id as `0x${string}`).then(setAgentBalance);
                      }
                    }}
                  />
                </div>
              </div> */}
              <div className="flex flex-col gap-2 p-3">
                <AgentIdentity />
                <AgentFinances />

                <AgentTools />
              </div>

              {/* Edit / Save Buttons */}
              <div className="m-2 flex gap-2">
                {!isEditing ? (
                  <Button variant="outline" onClick={() => setIsEditing(true)}>
                    Edit
                  </Button>
                ) : (
                  <>
                    {/* Manual Save (forces immediate update, ends editing) */}
                    <Button onClick={handleSaveChanges}>Save</Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        // revert changes to the last saved version
                        setEditForm(agent);
                        setModelConfig({
                          temperature: agent.temperature ?? 0.5,
                          maxTokens: agent.maxTokens ?? 100,
                          stopSequences: agent.stopSequences ?? [],
                          topP: agent.topP ?? 1,
                          frequencyPenalty: agent.frequencyPenalty ?? 0,
                          presencePenalty: agent.presencePenalty ?? 0,
                        });
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
        {/* <div className="col-span-6 my-2">
          {agent ? (
            <InteractionInterface agentId={id} />
          ) : (
            <div className="p-12 text-center">
              {!loadingAgent && <p>No agent loaded.</p>}
            </div>
          )}
        </div> */}
        <div className="col-span-5 ">
          <SessionInterface height={"72vh"} />
        </div>

        {/* Right Panel (Presets, etc.) */}
        {/* <div className="col-span-3">
          <ScrollArea className="h-[90vh] border p-3 my-2 mr-2 rounded-lg">
            <Presets
              agent={editForm}
              setAgent={setEditForm}
              customTools={customTools}
              setCustomTools={setCustomTools}
              modelConfig={modelConfig}
              setModelConfig={setModelConfig}
              userAddress={userAddress}
            />
          </ScrollArea>
        </div> */}
      </div>
    </div>
  );
}
