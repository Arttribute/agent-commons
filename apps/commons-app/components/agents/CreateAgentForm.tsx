"use client";

import { useState, useEffect } from "react";
import { useChainClients } from "@/hooks/useChainClients";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Bot, Brain, PenToolIcon as Tool } from "lucide-react";
import ImageUploader from "./ImageUploader";
import KnowledgeBaseInput from "./KnowledgeBaseInput";
import { Presets } from "./Presets";
import { useAgentRegistry } from "@/hooks/useAgentRegistry";
import { EIP1193Provider, usePrivy, useWallets } from "@privy-io/react-auth";

interface ModelConfig {
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

export function AgentForm() {
  const [agent, setAgent] = useState<Partial<CommonAgent>>({
    mode: "userDriven",
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
  //const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);

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

  const { publicClient, walletClient } = useChainClients(provider);
  const { registerAgent } = useAgentRegistry(publicClient, walletClient);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Construct final agent data
    const finalAgent = {
      ...agent,
      // Just an example for tools
      common_tools: [
        ...(agent.common_tools || []),
        ...JSON.parse(`[${customTools.common || ""}]`),
      ],
      external_tools: [
        ...(agent.external_tools || []),
        ...JSON.parse(`[${customTools.external || ""}]`),
      ],
      modelConfig,
      // You could store persona => instructions etc. as well
      // or rename as needed to match your Nest schema fields
      instructions: agent.instruction,
    };

    try {
      // Call either your Next.js proxy route ("/api/agents")
      // or the Nest server directly.
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
        // register agent in registry
        await registerAgent(
          json.data.agentId,
          "https://coral-abstract-dolphin-257.mypinata.cloud/ipfs/bafkreiedckiafwwzwo3rlrgnx4tewyrtrogxylucba5qiozp5sgm47ulcy",
          false
        );
        alert("Agent created successfully!");
      }
    } catch (error) {
      console.error("Exception when creating agent:", error);
      alert("Exception when creating agent.");
    }

    // Reset for demonstration
    setCustomTools({ common: "", external: "" });
    setModelConfig({
      temperature: 1,
      maxTokens: 2048,
      stopSequences: [],
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="container mx-auto max-w-lg">
      <Card className="bg-background border-2 h-[570px] flex flex-col">
        <CardHeader>
          <CardTitle>Create New Agent</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col flex-grow overflow-hidden">
          <Tabs defaultValue="basic" className="space-y-6">
            <TabsList className="grid grid-cols-3 gap-4">
              <TabsTrigger value="basic" className="gap-2">
                <Bot className="h-4 w-4" />
                Basic Info
              </TabsTrigger>
              <TabsTrigger value="behavior" className="gap-2">
                <Brain className="h-4 w-4" />
                Behavior
              </TabsTrigger>
              <TabsTrigger value="advanced" className="gap-2">
                <Tool className="h-4 w-4" />
                Advanced
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="overflow-y-auto h-[360px] px-2 w-full overflow-hidden">
              <div className="m-1">
                <TabsContent value="basic" className="space-y-4">
                  <div className="grid gap-4">
                    <div className="flex items-center gap-2">
                      <ImageUploader
                        onImageChange={(imageUrl) =>
                          setAgent({ ...agent, profileImage: imageUrl })
                        }
                        defaultImage={agent.profileImage}
                      />
                      <div className="w-full">
                        <Label htmlFor="name">Agent Name</Label>
                        <Input
                          id="name"
                          value={agent.name || ""}
                          onChange={(e) =>
                            setAgent({ ...agent, name: e.target.value })
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
                          setAgent({ ...agent, persona: e.target.value })
                        }
                        placeholder="Describe your agent's personality..."
                        className="min-h-[200px]"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="behavior" className="space-y-4">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="instruction">Instructions</Label>
                      <Textarea
                        id="instruction"
                        value={agent.instruction || ""}
                        onChange={(e) =>
                          setAgent({ ...agent, instruction: e.target.value })
                        }
                        placeholder="Provide instructions..."
                        className="h-[80px]"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Mode</Label>
                      <Select
                        value={agent.mode}
                        onValueChange={(value: AgentMode) =>
                          setAgent({ ...agent, mode: value })
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
                            setAgent({
                              ...agent,
                              autoInterval: Number.parseInt(e.target.value),
                            })
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
                          setAgent({ ...agent, knowledgebase: value })
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-6">
                  <Presets />
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>

          <div className="mt-auto">
            <Button type="submit" className="w-full">
              Create Agent
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
