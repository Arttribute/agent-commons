"use client";

import { useEffect, useState, useRef } from "react";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Scroll } from "lucide-react";

// Layout & local components
import AppBar from "@/components/layout/app-bar";
import AgentFinances from "@/components/finances/agent-finances";
import AgentTools from "@/components/tools/agent-tools";
import AgentIdentity from "@/components/agents/agent-identity";
import SessionInterface from "@/components/sessions/session-interface";
import { AgentMetrics } from "@/components/agents/agent-metrics";
import { AgentKnowledgebase } from "@/components/agents/agent-knowledge-base";
import SessionsList from "@/components/sessions/sessions-list";
import { PreferedAgentConnections } from "@/components/connections/prefered-agent-connections";
import { useAgentContext } from "@/context/AgentContext";
// Hooks
import { EIP1193Provider, useWallets } from "@privy-io/react-auth";
import { useChainClients } from "@/hooks/useChainClients";
import { useCommonToken } from "@/hooks/useCommonToken";
import { useAuth } from "@/context/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const { messages, setMessages } = useAgentContext();
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

  // Add state for new resources
  const [knowledgebase, setKnowledgebase] = useState<any[]>([]);
  const [preferredConnections, setPreferredConnections] = useState<any[]>([]);
  const [agentTools, setAgentTools] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  // Chat state for studio page
  const [studioSession, setStudioSession] = useState<any>(null);
  const [studioMessages, setStudioMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

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

  // Fetch new resources
  useEffect(() => {
    if (id) {
      fetch(`/api/agents/${id}/knowledgebase`)
        .then((res) => res.json())
        .then((json) => setKnowledgebase(json.data || []));
      fetch(`/api/agents/${id}/preferred-connections`)
        .then((res) => res.json())
        .then((json) => setPreferredConnections(json.data || []));
      fetch(`/api/agents/${id}/tools`)
        .then((res) => res.json())
        .then((json) => setAgentTools(json.data || []));
    }
  }, [id]);

  const fetchSessions = async () => {
    const agentId = id;
    console.log("User Address:", userAddress);
    const res = await fetch(
      `/api/sessions/list?agentId=${agentId}&initiatorId=${userAddress}`
    );
    const data = await res.json();
    console.log("Fetched sessions: Data", data);
    setSessions(data.data || []);
    console.log("Fetched sessions:", data.data);
  };

  // Fetch sessions for this agent
  useEffect(() => {
    if (id && userAddress) {
      fetchSessions();
    }
  }, [id, userAddress]);

  // Start a new session or fetch the latest session for this agent and user
  useEffect(() => {
    if (!id || !userAddress) return;
    async function fetchOrCreateSession() {
      setChatLoading(true);
      // Try to find an existing session for this agent and user
      const res = await fetch(
        `/api/sessions?agentId=${id}&initiator=${userAddress}`
      );
      const json = await res.json();
      let session = json.data && json.data.length > 0 ? json.data[0] : null;
      if (!session) {
        // Create a new session
        const createRes = await fetch(`/api/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: id, initiator: userAddress }),
        });
        const createJson = await createRes.json();
        session = createJson.data;
      }
      setStudioSession(session);
      setStudioMessages(session.history || []);
      setChatLoading(false);
    }
    fetchOrCreateSession();
  }, [id, userAddress]);

  // Send a message in the studio chat
  async function handleStudioSendMessage(input: string) {
    if (!studioSession) return;
    setChatLoading(true);
    setStudioMessages((prev) => [
      ...prev,
      { role: "human", content: input, timestamp: new Date().toISOString() },
    ]);
    // Send to backend
    const res = await fetch(`/api/agents/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: id,
        sessionId: studioSession.sessionId,
        messages: [{ role: "user", content: input }],
      }),
    });
    const json = await res.json();
    setStudioMessages((prev) => [
      ...prev,
      {
        role: "ai",
        content: json.data.content,
        timestamp: new Date().toISOString(),
      },
    ]);
    setChatLoading(false);
  }

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
              <div className="flex flex-col gap-2 p-3">
                <AgentIdentity
                  agent={agent}
                  isOwner={userAddress === agent?.owner}
                  onUpdate={async (data) => {
                    setEditForm((prev) => ({ ...prev, ...data }));
                    await updateAgentInDB();
                    fetchAgent();
                  }}
                />
                <AgentFinances />

                <AgentTools
                  agentTools={agentTools}
                  setAgentTools={setAgentTools}
                  agentId={id}
                />
                <AgentKnowledgebase
                  knowledgebase={knowledgebase}
                  setKnowledgebase={setKnowledgebase}
                  agentId={id}
                />
                <PreferedAgentConnections
                  preferredConnections={preferredConnections}
                  setPreferredConnections={setPreferredConnections}
                  agentId={id}
                />
              </div>

              {/* Edit / Save Buttons */}
              {/* <div className="m-2 flex gap-2">
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
              </div> */}
            </>
          ) : (
            <div className="m-4">
              <p>Agent not found.</p>
            </div>
          )}
        </div>

        <div className="col-span-5">
          <SessionInterface
            agent={agent}
            session={studioSession}
            agentId={id}
            sessionId={studioSession?.sessionId || ""}
            userId={userAddress}
            height="72vh"
            onSessionCreated={(newSessionId) => {
              // Fetch the new session and update state
              fetch(`/api/sessions/session/full?sessionId=${newSessionId}`)
                .then((res) => res.json())
                .then((json) => setStudioSession(json.data));
            }}
          />
        </div>

        <div className="col-span-2 p-2">
          <AgentMetrics agentId={id} />

          <div className="m-2 bg-white border border-gray-400 rounded-xl p-2">
            <h3 className="text-sm font-semibold">Recent Sessions</h3>
            <ScrollArea className="h-48 p-1">
              <SessionsList sessions={sessions} />
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
