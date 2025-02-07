"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { CommonAgent } from "@/types/agent";
import ToolSelector from "@/components/tools/ToolSelector";
import { JsonEditor } from "./JsonEditor";
import { TagInput } from "./TagInput";

interface ModelConfig {
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

export function Presets() {
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

  //   const handleSubmit = (e: React.FormEvent) => {
  //     e.preventDefault();
  //     const finalAgent = {
  //       ...agent,
  //       common_tools: [
  //         ...(agent.common_tools || []),
  //         ...JSON.parse(`[${customTools.common}]`),
  //       ],
  //       external_tools: [
  //         ...(agent.external_tools || []),
  //         ...JSON.parse(`[${customTools.external}]`),
  //       ],
  //       modelConfig,
  //     };
  //     console.log("Agent data:", finalAgent);
  //   };

  return (
    <div className="space-y-6 w-full">
      <div className="grid gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Tools</h3>
          <div className="p-4 border rounded-lg">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Core Tools</h4>
              <p className="text-sm text-muted-foreground">
                Core tools are automatically assigned and cannot be modified.
              </p>
            </div>
            <div className="space-y-4">
              <Label>Common Tools</Label>
              <div className="space-y-2">
                {agent.common_tools?.map((toolId: string) => (
                  <div key={toolId} className="p-2 bg-muted rounded-lg">
                    Tool ID: {toolId}
                  </div>
                ))}
                <ToolSelector
                  type="common"
                  onToolSelect={(toolId) =>
                    setAgent({
                      ...agent,
                      common_tools: [...(agent.common_tools || []), toolId],
                    })
                  }
                  onCustomToolAdd={(toolJson) =>
                    setCustomTools((prev) => ({
                      ...prev,
                      common: prev.common
                        ? `${prev.common},${toolJson}`
                        : toolJson,
                    }))
                  }
                  selectedTools={agent.common_tools || []}
                />
                {customTools.common && (
                  <div className="mt-2">
                    <Label>Custom Common Tools</Label>
                    <JsonEditor
                      label="Custom Common Tools JSON"
                      value={customTools.common}
                      onChange={(value) =>
                        setCustomTools((prev) => ({
                          ...prev,
                          common: value,
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <Label>External Tools</Label>
              <div className="space-y-2">
                {agent.external_tools?.map((toolId: string) => (
                  <div key={toolId} className="p-2 bg-muted rounded-lg">
                    Tool ID: {toolId}
                  </div>
                ))}
                <ToolSelector
                  type="external"
                  onToolSelect={(toolId) =>
                    setAgent({
                      ...agent,
                      external_tools: [...(agent.external_tools || []), toolId],
                    })
                  }
                  onCustomToolAdd={(toolJson) =>
                    setCustomTools((prev) => ({
                      ...prev,
                      external: prev.external
                        ? `${prev.external},${toolJson}`
                        : toolJson,
                    }))
                  }
                  selectedTools={agent.external_tools || []}
                />
                {customTools.external && (
                  <div className="mt-2">
                    <Label>Custom External Tools</Label>
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

        <div className="space-y-4">
          <h3 className="text-lg font-medium">Model Configuration</h3>
          <div className="p-4 border rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature</Label>
              <Slider
                id="temperature"
                min={0}
                max={2}
                step={0.01}
                value={[modelConfig.temperature]}
                onValueChange={([value]) =>
                  setModelConfig({
                    ...modelConfig,
                    temperature: value,
                  })
                }
              />
              <div className="text-right text-xs text-muted-foreground">
                {modelConfig.temperature.toFixed(2)}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <Slider
                id="maxTokens"
                min={1}
                max={16383}
                step={1}
                value={[modelConfig.maxTokens]}
                onValueChange={([value]) =>
                  setModelConfig({
                    ...modelConfig,
                    maxTokens: value,
                  })
                }
              />
              <div className="text-right text-xs text-muted-foreground">
                {modelConfig.maxTokens}
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <Label htmlFor="stopSequences">Stop Sequences</Label>
              <TagInput
                tags={modelConfig.stopSequences}
                setTags={(tags) =>
                  setModelConfig({
                    ...modelConfig,
                    stopSequences: tags,
                  })
                }
                placeholder="Enter sequence and press Tab"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="topP">Top P</Label>
              <Slider
                id="topP"
                min={0}
                max={1}
                step={0.01}
                value={[modelConfig.topP]}
                onValueChange={([value]) =>
                  setModelConfig({ ...modelConfig, topP: value })
                }
              />
              <div className="text-right text-xs text-muted-foreground">
                {modelConfig.topP.toFixed(2)}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="frequencyPenalty">Frequency Penalty</Label>
              <Slider
                id="frequencyPenalty"
                min={0}
                max={2}
                step={0.01}
                value={[modelConfig.frequencyPenalty]}
                onValueChange={([value]) =>
                  setModelConfig({
                    ...modelConfig,
                    frequencyPenalty: value,
                  })
                }
              />
              <div className="text-right text-xs text-muted-foreground">
                {modelConfig.frequencyPenalty.toFixed(2)}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="presencePenalty">Presence Penalty</Label>
              <Slider
                id="presencePenalty"
                min={0}
                max={2}
                step={0.01}
                value={[modelConfig.presencePenalty]}
                onValueChange={([value]) =>
                  setModelConfig({
                    ...modelConfig,
                    presencePenalty: value,
                  })
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
