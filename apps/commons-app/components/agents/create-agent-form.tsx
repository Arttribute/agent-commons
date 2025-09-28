"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useChainClients } from "@/hooks/useChainClients";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { AgentMode, CommonAgent } from "@/types/agent";
import { Bot, Brain, Cog } from "lucide-react";

import ImageUploader from "./ImageUploader";
import KnowledgeBaseInput from "./KnowledgeBaseInput";
import { Presets } from "./presets"; // import your updated Presets
import { useAgentRegistry } from "@/hooks/useAgentRegistry";
import { EIP1193Provider, useWallets } from "@privy-io/react-auth";
import { useAuth } from "@/context/AuthContext";

/** Example interface for model config */
interface ModelConfig {
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

export function CreateAgentForm() {
  const router = useRouter();
  const { authState } = useAuth();
  const { walletAddress } = authState;

  const [agent, setAgent] = useState<Partial<CommonAgent>>({
    mode: "userDriven",
    common_tools: [],
    external_tools: [],
  });

  const [customTools, setCustomTools] = useState<{ [key: string]: string }>({
    common: "",
    external: "",
  });

  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    temperature: 1,
    maxTokens: 2048,
    stopSequences: [],
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  });

  const { wallets } = useWallets();
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [loadingCreate, setLoadingCreate] = useState(false);

  // The wallet address in lowercase
  const userAddress = walletAddress?.toLowerCase();

  const { publicClient, walletClient } = useChainClients(provider);
  const { registerAgent } = useAgentRegistry(publicClient, walletClient);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingCreate(true);

    if (!userAddress) {
      alert("No user address found. Please connect a wallet first.");
      setLoadingCreate(false);
      return;
    }

    // Merging any custom JSON from user input
    // The custom JSON might contain an array of tool IDs
    const finalCommonTools = [
      ...(agent.common_tools || []),
      ...((customTools.common
        ? JSON.parse(`[${customTools.common}]`)
        : []) as string[]),
    ];

    const finalExternalTools = [
      ...(agent.external_tools || []),
      ...((customTools.external
        ? JSON.parse(`[${customTools.external}]`)
        : []) as string[]),
    ];

    // Build the final agent payload
    const finalAgent = {
      ...agent,
      owner: userAddress,
      common_tools: finalCommonTools,
      external_tools: finalExternalTools,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      stopSequence: modelConfig.stopSequences,
      topP: modelConfig.topP,
      frequencyPenalty: modelConfig.frequencyPenalty,
      presencePenalty: modelConfig.presencePenalty,
    };

    try {
      // POST to /api/agents (create a new agent)
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalAgent),
      });
      const json = await res.json();

      if (!res.ok) {
        console.error("Failed creating agent", json);
        alert("Failed creating agent.");
      } else {
        console.log("Agent created:", json.data);

        // If you do any on-chain registration
        await registerAgent(
          json.data.agent_id, // or .agentId, depending on how your DB returns it
          "https://someurl-metadata...",
          false
        );

        alert("Agent created successfully!");
        router.push("/studio/agents");
      }
    } catch (error) {
      console.error("Exception when creating agent:", error);
      alert("Exception when creating agent.");
    }

    // Reset everything
    setCustomTools({ common: "", external: "" });
    setModelConfig({
      temperature: 1,
      maxTokens: 2048,
      stopSequences: [],
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
    });
    setAgent({
      mode: "userDriven",
      common_tools: [],
      external_tools: [],
    });
    setLoadingCreate(false);
  };

  return (
    <form onSubmit={handleSubmit} className="container mx-auto max-w-lg">
      <Card className="bg-background border border-gray-400 h-[600px] flex flex-col">
        <div className="m-8">
          <div className="bg-lime-300 w-48 h-8 -mb-8 rounded-lg"></div>
          <h2 className="text-2xl font-semibold">Create New Agent</h2>
        </div>
        <CardContent className="flex flex-col flex-grow overflow-hidden">
          <Tabs defaultValue="basic" className="space-y-6">
            <TabsList className="grid grid-cols-3 gap-4 border border-gray-400">
              <TabsTrigger value="basic" className="gap-2">
                <Bot className="h-4 w-4" />
                Basic Info
              </TabsTrigger>
              <TabsTrigger value="behavior" className="gap-2">
                <Brain className="h-4 w-4" />
                Behavior
              </TabsTrigger>
              <TabsTrigger value="advanced" className="gap-2">
                <Cog className="h-4 w-4" />
                Advanced
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="overflow-y-auto h-[360px] px-2 w-full overflow-hidden">
              <div className="m-1">
                {/* BASIC */}
                <TabsContent value="basic" className="space-y-4">
                  <div className="grid gap-4">
                    <div className="flex items-center gap-2">
                      <ImageUploader
                        onImageChange={(imageUrl) =>
                          setAgent((prev) => ({ ...prev, avatar: imageUrl }))
                        }
                        defaultImage={agent.avatar}
                      />
                      <div className="w-full">
                        <Label htmlFor="name">Agent Name</Label>
                        <Input
                          id="name"
                          value={agent.name || ""}
                          onChange={(e) =>
                            setAgent((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          placeholder="My Awesome Agent"
                          className="w-full"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="persona">Persona</Label>
                      <Textarea
                        id="persona"
                        value={agent.persona || ""}
                        onChange={(e) =>
                          setAgent((prev) => ({
                            ...prev,
                            persona: e.target.value,
                          }))
                        }
                        placeholder="Describe your agent's personality..."
                        className="min-h-[150px]"
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* BEHAVIOR */}
                <TabsContent value="behavior" className="space-y-4">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="instruction">Instructions</Label>
                      <Textarea
                        id="instruction"
                        value={agent.instructions || ""}
                        onChange={(e) =>
                          setAgent((prev) => ({
                            ...prev,
                            instructions: e.target.value,
                          }))
                        }
                        placeholder="Main instructions for your agent..."
                        className="h-[80px]"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Mode</Label>
                      <Select
                        value={agent.mode}
                        onValueChange={(value: AgentMode) =>
                          setAgent((prev) => ({ ...prev, mode: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fullyAutonomous">
                            Fully Autonomous
                          </SelectItem>
                          <SelectItem value="userDriven">
                            User Driven
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {agent.mode === "fullyAutonomous" && (
                      <div className="grid gap-2">
                        <Label htmlFor="autoInterval">Auto Interval (ms)</Label>
                        <Input
                          id="autoInterval"
                          type="number"
                          value={agent.autoInterval || ""}
                          onChange={(e) =>
                            setAgent((prev) => ({
                              ...prev,
                              autoInterval: Number(e.target.value),
                            }))
                          }
                          placeholder="5000"
                        />
                      </div>
                    )}

                    <div className="grid gap-2">
                      <Label htmlFor="knowledgebase">Knowledge Base</Label>
                      <KnowledgeBaseInput
                        value={agent.knowledgebase || ""}
                        onChange={(value) =>
                          setAgent((prev) => ({
                            ...prev,
                            knowledgebase: value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* ADVANCED */}
                <TabsContent value="advanced" className="space-y-6">
                  <Presets
                    agent={agent}
                    setAgent={setAgent}
                    customTools={customTools}
                    setCustomTools={setCustomTools}
                    modelConfig={modelConfig}
                    setModelConfig={setModelConfig}
                    userAddress={userAddress || ""}
                  />
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>

          <div className="mt-auto">
            <Button type="submit" className="w-full" disabled={loadingCreate}>
              {loadingCreate ? "Creating Agent..." : "Create Agent"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
