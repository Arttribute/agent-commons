"use client";

import type React from "react";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, Copy, Eye, EyeOff, PencilIcon } from "lucide-react";
import RandomAvatar from "@/components/account/random-avatar";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const MODEL_PLACEHOLDERS: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  ollama: "llama3",
};

export default function AgentIdentity({
  agent,
  isOwner,
  onUpdate,
}: {
  agent: any;
  isOwner: boolean;
  onUpdate: (data: any) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editData, setEditData] = useState({
    name: agent?.name || "",
    persona: agent?.persona || "",
    instructions: agent?.instructions || "",
    description: agent?.description || "",
    avatar: agent?.avatar || "",
    ttsProvider:
      (agent?.ttsProvider as "openai" | "elevenlabs") ||
      (agent?.tts_provider as "openai" | "elevenlabs") ||
      "openai",
    ttsVoice: (agent?.ttsVoice as string) || (agent?.tts_voice as string) || "",
    modelProvider: (agent?.modelProvider as string) || "openai",
    modelId: agent?.modelId || "",
    modelApiKey: agent?.modelApiKey || "",
    modelBaseUrl: agent?.modelBaseUrl || "",
    temperature: agent?.temperature ?? 0.7,
    maxTokens: agent?.maxTokens ?? 4096,
  });
  const [saving, setSaving] = useState(false);
  const [voices, setVoices] = useState<Array<{ id: string; name: string }>>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const agentAddress = agent?.agentId || "";

  const copyToClipboard = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(agentAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChange = (field: string, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNumberChange = (field: string, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(editData);
    setSaving(false);
  };

  // Keep local state in sync when agent prop changes
  useEffect(() => {
    setEditData((prev) => ({
      ...prev,
      name: agent?.name || "",
      persona: agent?.persona || "",
      instructions: agent?.instructions || "",
      description: agent?.description || "",
      avatar: agent?.avatar || "",
      ttsProvider:
        (agent?.ttsProvider as "openai" | "elevenlabs") ||
        (agent?.tts_provider as "openai" | "elevenlabs") ||
        prev.ttsProvider ||
        "openai",
      ttsVoice:
        (agent?.ttsVoice as string) ||
        (agent?.tts_voice as string) ||
        prev.ttsVoice ||
        "",
      modelProvider: (agent?.modelProvider as string) || prev.modelProvider || "openai",
      modelId: agent?.modelId || prev.modelId || "",
      modelApiKey: agent?.modelApiKey || prev.modelApiKey || "",
      modelBaseUrl: agent?.modelBaseUrl || prev.modelBaseUrl || "",
      temperature: agent?.temperature ?? prev.temperature ?? 0.7,
      maxTokens: agent?.maxTokens ?? prev.maxTokens ?? 4096,
    }));
  }, [agent]);

  // Fetch voices when provider changes or on open
  const loadVoices = async (provider: "openai" | "elevenlabs") => {
    try {
      setVoicesLoading(true);
      if (provider === "openai") {
        // Do not fetch; use a broader default list and allow client env override
        const env = (process.env.NEXT_PUBLIC_OPENAI_TTS_VOICES || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const fallbacks = [
          "alloy",
          "ash",
          "ballad",
          "verse",
          "aria",
          "coral",
          "sage",
          "ember",
          "vibe",
        ];
        const list = (env.length ? env : fallbacks).map((v) => ({
          id: v,
          name: v.charAt(0).toUpperCase() + v.slice(1),
        }));
        const local = list;
        setVoices(local);
        if (!local.find((v) => v.id === editData.ttsVoice)) {
          setEditData((p) => ({ ...p, ttsVoice: local[0]?.id || "" }));
        }
      } else {
        const res = await fetch(`/api/tts/voices?provider=${provider}`);
        const json = await res.json();
        const list: Array<{ id: string; name: string; provider: string }> =
          json.data || [];
        setVoices(list.map((v) => ({ id: v.id, name: v.name })));
        if (!list.find((v: any) => v.id === editData.ttsVoice)) {
          setEditData((p) => ({ ...p, ttsVoice: list[0]?.id || "" }));
        }
      }
    } catch (e) {
      console.error("Failed to load voices", e);
      setVoices([]);
    } finally {
      setVoicesLoading(false);
    }
  };

  useEffect(() => {
    loadVoices(editData.ttsProvider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editData.ttsProvider]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex flex-col cursor-pointer border border-border rounded-xl p-3 hover:border-border transition-colors relative group">
          <div className="flex items-center gap-2 mb-2">
            <RandomAvatar size={48} username={agent?.name || "agent"} />
            <div className="flex flex-col">
              <h2 className="ml-1 font-semibold">
                {agent?.name || "Agent name"}
              </h2>
              <div className="flex items-center gap-2 bg-muted p-0.5 px-2 rounded-3xl w-fit max-w-52">
                <p className="text-muted-foreground text-xs truncate">{agentAddress}</p>
                <button
                  onClick={copyToClipboard}
                  className={cn(
                    " ml-1 p-1 rounded-full hover:bg-accent transition-colors",
                    copied ? "text-green-500" : "text-muted-foreground"
                  )}
                  aria-label={copied ? "Copied" : "Copy address"}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>

          <div className="m-1">
            <p className="text-xs font-semibold mb-0.5">Persona</p>
            <p className="text-xs text-muted-foreground truncate">
              {agent?.persona || "No persona set."}
            </p>
          </div>
          <div className="m-1">
            <p className="text-xs font-semibold mb-0.5">Instructions</p>
            <p className="text-xs text-muted-foreground truncate">
              {agent?.instructions || "No instructions set."}
            </p>
          </div>
          <div className="m-1 ,mb-2">
            <p className="text-xs font-semibold mb-0.5">Description</p>
            <p className="text-xs text-muted-foreground truncate">
              {agent?.description || "No description set."}
            </p>
          </div>
        </div>
      </DialogTrigger>
      {isOwner && (
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agent Identity</DialogTitle>
            <DialogDescription>
              {
                "Make changes to your profile here. Click save when you're done."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-24">
              <input type="file" name="file" id="file" className="hidden" />
              <label htmlFor="file" className="cursor-pointer w-full">
                <RandomAvatar size={80} username={editData.name || "agent"} />
                <div className="flex items-center justify-center p-2 bg-background border border-border rounded-full w-8 -mt-10 ml-auto mx-2">
                  <PencilIcon className="w-4 h-4 text-foreground " />
                </div>
              </label>
            </div>
            <div className="flex flex-col w-full">
              <div className="flex items-center gap-2 bg-muted p-0.5 px-2 rounded-3xl w-fit max-w-96">
                <p className="text-muted-foreground text-xs truncate">{agentAddress}</p>
                <button
                  onClick={copyToClipboard}
                  className={cn(
                    " ml-1 p-1 rounded-full hover:bg-accent transition-colors",
                    copied ? "text-green-500" : "text-muted-foreground"
                  )}
                  aria-label={copied ? "Copied" : "Copy address"}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex flex-col w-full mt-1 ">
                <Input
                  placeholder="Enter agent name"
                  value={editData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                />
              </div>
            </div>
          </div>

          <Label className="text-sm font-semibold">Persona</Label>
          <Textarea
            className="w-full h-20 -mt-2"
            placeholder="Share something about yourself"
            value={editData.persona}
            onChange={(e) => handleChange("persona", e.target.value)}
          />

          <Label className="text-sm font-semibold">Instructions</Label>
          <Textarea
            className="w-full h-20 -mt-2"
            placeholder="Share something about yourself"
            value={editData.instructions}
            onChange={(e) => handleChange("instructions", e.target.value)}
          />

          {/* Voice Settings */}
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-1">
              <Label className="text-sm font-semibold">TTS Provider</Label>
              <Select
                value={editData.ttsProvider}
                onValueChange={(val) =>
                  setEditData((p) => ({
                    ...p,
                    ttsProvider: val as "openai" | "elevenlabs",
                  }))
                }
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-1">
              <Label className="text-sm font-semibold">Voice</Label>
              <Select
                value={editData.ttsVoice}
                onOpenChange={(open) => {
                  if (open && voices.length === 0) {
                    loadVoices(editData.ttsProvider);
                  }
                }}
                onValueChange={(val) =>
                  setEditData((p) => ({ ...p, ttsVoice: val }))
                }
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue
                    placeholder={
                      voicesLoading ? "Loading voices..." : "Select voice"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {editData.ttsProvider === "openai"
                  ? "OpenAI example voices: alloy, coral, verse"
                  : "Requires ELEVENLABS_API_KEY in the server env"}
              </p>
              {editData.ttsProvider === "elevenlabs" && (
                <div className="mt-2">
                  <Label className="text-xs">
                    Or paste an ElevenLabs Voice ID
                  </Label>
                  <Input
                    className="mt-1"
                    placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                    value={editData.ttsVoice}
                    onChange={(e) =>
                      setEditData((p) => ({ ...p, ttsVoice: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>
          </div>

          <Label className="text-sm font-semibold">Description</Label>
          <Textarea
            className="w-full h-20 -mt-2"
            placeholder="Share something about yourself"
            value={editData.description}
            onChange={(e) => handleChange("description", e.target.value)}
          />

          {/* Model Configuration */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Model Configuration
            </span>
            <Separator className="flex-1" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-1">
              <Label className="text-sm font-semibold">Provider</Label>
              <Select
                value={editData.modelProvider}
                onValueChange={(val) => handleChange("modelProvider", val)}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-1">
              <Label className="text-sm font-semibold">Model ID</Label>
              <Input
                className="mt-1"
                placeholder={
                  MODEL_PLACEHOLDERS[editData.modelProvider] || "Enter model ID"
                }
                value={editData.modelId}
                onChange={(e) => handleChange("modelId", e.target.value)}
              />
            </div>
          </div>

          {editData.modelProvider !== "ollama" && (
            <div>
              <Label className="text-sm font-semibold">API Key</Label>
              <div className="relative mt-1">
                <Input
                  type={showApiKey ? "text" : "password"}
                  placeholder="Enter API key"
                  value={editData.modelApiKey}
                  onChange={(e) => handleChange("modelApiKey", e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {editData.modelProvider === "ollama" && (
            <div>
              <Label className="text-sm font-semibold">Base URL</Label>
              <Input
                className="mt-1"
                placeholder="http://localhost:11434"
                value={editData.modelBaseUrl}
                onChange={(e) => handleChange("modelBaseUrl", e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-1">
              <Label className="text-sm font-semibold">Temperature</Label>
              <Input
                className="mt-1"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={editData.temperature}
                onChange={(e) =>
                  handleNumberChange("temperature", e.target.value)
                }
              />
            </div>
            <div className="col-span-1">
              <Label className="text-sm font-semibold">Max Tokens</Label>
              <Input
                className="mt-1"
                type="number"
                min={1}
                value={editData.maxTokens}
                onChange={(e) =>
                  handleNumberChange("maxTokens", e.target.value)
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full mt-2"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
