"use client";

import { useState } from "react";
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
import { Slider } from "@/components/ui/slider";
import type { AgentMode, CommonAgent } from "@/types/agent";
import { Bot, Brain, PenToolIcon as Tool } from "lucide-react";
import ImageUploader from "./ImageUploader";
import ToolSelector from "./ToolSelector";
import KnowledgeBaseInput from "./KnowledgeBaseInput";
import { JsonEditor } from "./JsonEditor";
import { TagInput } from "./TagInput";
import { Presets } from "./Presets";

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalAgent = {
      ...agent,
      common_tools: [
        ...(agent.common_tools || []),
        ...JSON.parse(`[${customTools.common}]`),
      ],
      external_tools: [
        ...(agent.external_tools || []),
        ...JSON.parse(`[${customTools.external}]`),
      ],
      modelConfig,
    };
    console.log("Agent data:", finalAgent);
  };

  return (
    <form onSubmit={handleSubmit} className="container mx-auto max-w-lg ">
      <Card className="bg-background border-2 h-[580px] flex flex-col">
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
                        placeholder="Describe your agent's personality and characteristics..."
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
                        placeholder="Provide detailed instructions for your agent..."
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

          <div className="mt-auto ">
            <Button type="submit" className="w-full">
              Create Agent
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
