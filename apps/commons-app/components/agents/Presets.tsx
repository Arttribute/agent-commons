"use client";

import { Dispatch, SetStateAction } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { JsonEditor } from "./JsonEditor";
import { TagInput } from "./TagInput";
import ToolSelector from "@/components/tools/ToolSelector";
import type { CommonAgent } from "@/types/agent";

// Example interface for your model config
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
}

export function Presets({
  agent,
  setAgent,
  customTools,
  setCustomTools,
  modelConfig,
  setModelConfig,
}: PresetsProps) {
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
            <div className="space-y-4 mt-4">
              <Label>Common Tools</Label>
              <div className="space-y-2">
                {agent.common_tools?.map((toolId) => (
                  <div key={toolId} className="p-2 bg-muted rounded-lg">
                    Tool ID: {toolId}
                  </div>
                ))}
                <ToolSelector
                  type="common"
                  onToolSelect={(toolId) =>
                    setAgent((prev) => ({
                      ...prev,
                      common_tools: [...(prev.common_tools || []), toolId],
                    }))
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

            <div className="space-y-4 mt-4">
              <Label>External Tools</Label>
              <div className="space-y-2">
                {agent.external_tools?.map((toolId) => (
                  <div key={toolId} className="p-2 bg-muted rounded-lg">
                    Tool ID: {toolId}
                  </div>
                ))}
                <ToolSelector
                  type="external"
                  onToolSelect={(toolId) =>
                    setAgent((prev) => ({
                      ...prev,
                      external_tools: [...(prev.external_tools || []), toolId],
                    }))
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
                  setModelConfig((prev) => ({ ...prev, temperature: value }))
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
                  setModelConfig((prev) => ({ ...prev, maxTokens: value }))
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
                  setModelConfig((prev) => ({ ...prev, stopSequences: tags }))
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
                  setModelConfig((prev) => ({ ...prev, topP: value }))
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
