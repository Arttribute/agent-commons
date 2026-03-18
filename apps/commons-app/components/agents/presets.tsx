"use client";

import { Dispatch, SetStateAction, useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { JsonEditor } from "./json-editor";
import { TagInput } from "./tag-input";
import ToolSelector from "@/components/tools/tool-selector";
import type { CommonAgent } from "@/types/agent";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";

const MODEL_PROVIDERS = ["openai", "anthropic", "google", "groq", "ollama"] as const;
type ModelProvider = typeof MODEL_PROVIDERS[number];

const MODEL_PLACEHOLDERS: Record<ModelProvider, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  ollama: "llama3",
};

interface ModelConfig {
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

interface PresetsProps {
  agent: Partial<CommonAgent>;
  setAgent: Dispatch<SetStateAction<Partial<CommonAgent>>>;
  customTools: { [key: string]: string };
  setCustomTools: Dispatch<SetStateAction<{ [key: string]: string }>>;
  modelConfig: ModelConfig;
  setModelConfig: Dispatch<SetStateAction<ModelConfig>>;
  /**
   * You may pass the user's address if you want the Presets
   * to know who "owns" external tools. If you're using
   * agent.owner, you can omit this. Shown here for clarity.
   */
  userAddress?: string;
}

interface SelectedTool {
  id: string;
  name: string;
}

export function Presets({
  agent,
  setAgent,
  customTools,
  setCustomTools,
  modelConfig,
  setModelConfig,
  userAddress,
}: PresetsProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  // Local arrays to store the selected tool objects (id + name)
  const [commonToolsList, setCommonToolsList] = useState<SelectedTool[]>([]);
  const [externalToolsList, setExternalToolsList] = useState<SelectedTool[]>(
    []
  );

  // Handler for adding a "common" tool
  const handleSelectCommonTool = (tool: SelectedTool) => {
    // 1. Add the tool’s ID to agent.common_tools
    if (!agent.common_tools?.includes(tool.id)) {
      setAgent((prev) => ({
        ...prev,
        common_tools: [...(prev.common_tools || []), tool.id],
      }));
    }
    // 2. Keep an object with { id, name } for display
    setCommonToolsList((prev) => {
      // If we already have this ID, skip adding again
      if (prev.find((t) => t.id === tool.id)) return prev;
      return [...prev, tool];
    });
  };

  // Handler for adding an "external" tool
  const handleSelectExternalTool = (tool: SelectedTool) => {
    if (!agent.external_tools?.includes(tool.id)) {
      setAgent((prev) => ({
        ...prev,
        external_tools: [...(prev.external_tools || []), tool.id],
      }));
    }
    setExternalToolsList((prev) => {
      if (prev.find((t) => t.id === tool.id)) return prev;
      return [...prev, tool];
    });
  };

  // Display the selected "common" tool names
  // by matching the IDs in agent.common_tools
  const selectedCommonTools = (agent.common_tools || []).map((toolId) => {
    const found = commonToolsList.find((t) => t.id === toolId);
    return found
      ? found
      : { id: toolId, name: `Tool #${toolId.slice(0, 6)}...` }; // fallback if not in local list
  });

  // Display the selected "external" tool names
  const selectedExternalTools = (agent.external_tools || []).map((toolId) => {
    const found = externalToolsList.find((t) => t.id === toolId);
    return found
      ? found
      : { id: toolId, name: `Tool #${toolId.slice(0, 6)}...` };
  });

  return (
    <div className="space-y-6 w-full">
      <div className="grid gap-6">
        {/* Tools Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Tools</h3>

          <div className="p-4 border rounded-lg">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Core Tools</h4>
              <p className="text-sm text-muted-foreground">
                These might be automatically added by your system.
              </p>
            </div>

            {/* Common Tools */}
            <div className="space-y-4 mt-4">
              <Label>Common Tools</Label>
              <div className="space-y-2">
                {selectedCommonTools.map((tool) => (
                  <div key={tool.id} className="p-2 bg-muted rounded-lg">
                    {tool.name} (ID: {tool.id})
                  </div>
                ))}
                <ToolSelector
                  type="common"
                  // pass only the IDs to highlight which are selected
                  selectedTools={agent.common_tools || []}
                  // when user selects a tool from the modal
                  onToolSelect={handleSelectCommonTool}
                  // custom tool JSON
                  onCustomToolAdd={(toolJson) =>
                    setCustomTools((prev) => ({
                      ...prev,
                      common: prev.common
                        ? `${prev.common},${toolJson}`
                        : toolJson,
                    }))
                  }
                />

                {/* If user has added custom JSON for "common" */}
                {customTools.common && (
                  <div className="mt-2">
                    <Label>Custom Common Tools JSON</Label>
                    <JsonEditor
                      label="Custom Common Tools JSON"
                      value={customTools.common}
                      onChange={(value) =>
                        setCustomTools((prev) => ({ ...prev, common: value }))
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            {/* External Tools */}
            <div className="space-y-4 mt-4">
              <Label>External Tools</Label>
              <div className="space-y-2">
                {selectedExternalTools.map((tool) => (
                  <div key={tool.id} className="p-2 bg-muted rounded-lg">
                    {tool.name} (ID: {tool.id})
                  </div>
                ))}
                <ToolSelector
                  type="external"
                  // your user wallet might come via agent.owner or a prop
                  owner={userAddress || ""}
                  selectedTools={agent.external_tools || []}
                  onToolSelect={handleSelectExternalTool}
                  onCustomToolAdd={(toolJson) =>
                    setCustomTools((prev) => ({
                      ...prev,
                      external: prev.external
                        ? `${prev.external},${toolJson}`
                        : toolJson,
                    }))
                  }
                />

                {customTools.external && (
                  <div className="mt-2">
                    <Label>Custom External Tools JSON</Label>
                    <JsonEditor
                      label="Custom External Tools JSON"
                      value={customTools.external}
                      onChange={(value) =>
                        setCustomTools((prev) => ({
                          ...prev,
                          external: value,
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Model Configuration Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Model Configuration</h3>
          <div className="p-4 border rounded-lg space-y-4">
            {/* Provider + Model ID */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Provider</Label>
                <Select
                  value={(agent.modelProvider as ModelProvider) || "openai"}
                  onValueChange={(v) => setAgent((prev) => ({ ...prev, modelProvider: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Model ID</Label>
                <Input
                  value={agent.modelId || ""}
                  onChange={(e) => setAgent((prev) => ({ ...prev, modelId: e.target.value }))}
                  placeholder={MODEL_PLACEHOLDERS[(agent.modelProvider as ModelProvider) || "openai"]}
                />
              </div>
            </div>

            {/* API Key (not for ollama) */}
            {agent.modelProvider !== "ollama" && (
              <div className="space-y-1">
                <Label>API Key</Label>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={agent.modelApiKey || ""}
                    onChange={(e) => setAgent((prev) => ({ ...prev, modelApiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Base URL (ollama only) */}
            {agent.modelProvider === "ollama" && (
              <div className="space-y-1">
                <Label>Base URL</Label>
                <Input
                  value={agent.modelBaseUrl || ""}
                  onChange={(e) => setAgent((prev) => ({ ...prev, modelBaseUrl: e.target.value }))}
                  placeholder="http://localhost:11434"
                />
              </div>
            )}

            {/* Temperature */}
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature</Label>
              <Slider
                id="temperature"
                min={0}
                max={2}
                step={0.01}
                value={[modelConfig.temperature]}
                onValueChange={([value]) =>
                  setModelConfig((prev) => ({ ...prev, temperature: value }))
                }
              />
              <div className="text-right text-xs text-muted-foreground">
                {modelConfig.temperature.toFixed(2)}
              </div>
            </div>

            {/* Max Tokens */}
            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <Slider
                id="maxTokens"
                min={1}
                max={16383}
                step={1}
                value={[modelConfig.maxTokens]}
                onValueChange={([value]) =>
                  setModelConfig((prev) => ({ ...prev, maxTokens: value }))
                }
              />
              <div className="text-right text-xs text-muted-foreground">
                {modelConfig.maxTokens}
              </div>
            </div>

            {/* Stop Sequences */}
            <div className="space-y-2 mb-4">
              <Label htmlFor="stopSequences">Stop Sequences</Label>
              <TagInput
                tags={modelConfig.stopSequences}
                setTags={(tags) =>
                  setModelConfig((prev) => ({ ...prev, stopSequences: tags }))
                }
                placeholder="Enter sequence and press Tab"
              />
            </div>

            {/* TopP preset */}
            <div className="space-y-2">
              <Label htmlFor="topP">Top P</Label>
              <Slider
                id="topP"
                min={0}
                max={1}
                step={0.01}
                value={[modelConfig.topP]}
                onValueChange={([value]) =>
                  setModelConfig((prev) => ({ ...prev, topP: value }))
                }
              />
              <div className="text-right text-xs text-muted-foreground">
                {modelConfig.topP.toFixed(2)}
              </div>
            </div>

            {/* Frequency Penalty */}
            <div className="space-y-2">
              <Label htmlFor="frequencyPenalty">Frequency Penalty</Label>
              <Slider
                id="frequencyPenalty"
                min={0}
                max={2}
                step={0.01}
                value={[modelConfig.frequencyPenalty]}
                onValueChange={([value]) =>
                  setModelConfig((prev) => ({
                    ...prev,
                    frequencyPenalty: value,
                  }))
                }
              />
              <div className="text-right text-xs text-muted-foreground">
                {modelConfig.frequencyPenalty.toFixed(2)}
              </div>
            </div>

            {/* Presence Penalty */}
            <div className="space-y-2">
              <Label htmlFor="presencePenalty">Presence Penalty</Label>
              <Slider
                id="presencePenalty"
                min={0}
                max={2}
                step={0.01}
                value={[modelConfig.presencePenalty]}
                onValueChange={([value]) =>
                  setModelConfig((prev) => ({
                    ...prev,
                    presencePenalty: value,
                  }))
                }
              />
              <div className="text-right text-xs text-muted-foreground">
                {modelConfig.presencePenalty.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
