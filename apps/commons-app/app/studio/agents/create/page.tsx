"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import ImageUploader from "@/components/agents/ImageUploader";
import { PageTitle } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import type { AgentRuntimeType } from "@/types/agent";

interface RegistryModel {
  provider: string;
  modelId: string;
  displayName?: string;
}

const FALLBACK_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "mistral",
  "groq",
  "openrouter",
  "xai",
  "ollama",
];

const CUSTOM_MODEL = "__custom__";

const runtimeDescriptions: Record<string, string> = {
  native:
    "The mature native Agent Commons runtime with fast streaming and the full tool experience.",
  openclaw:
    "Runs on an isolated persistent managed computer. Sessions, tools, memory, and billing stay unified in Agent Commons.",
  hermes:
    "Runs on an isolated persistent managed computer. Sessions, tools, memory, and billing stay unified in Agent Commons.",
  custom:
    "Custom runtimes use the same session and capability contract and require a compatible managed image.",
};

export default function CreateAgentPage() {
  const router = useRouter();
  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase();

  const [models, setModels] = useState<RegistryModel[]>([]);
  const [form, setForm] = useState({
    name: "",
    avatar: "",
    instructions: "",
    runtimeType: "native" as AgentRuntimeType,
    modelProvider: "openai",
    modelId: "",
    customModelId: "",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        const raw = Array.isArray(d?.data) ? d.data : [];
        setModels(
          raw.filter(
            (m: Partial<RegistryModel>) =>
              typeof m.modelId === "string" && typeof m.provider === "string",
          ),
        );
      })
      .catch(() => {});
  }, []);

  const providers = useMemo(() => {
    const fromRegistry = models.map((m) => m.provider);
    return [...new Set([...FALLBACK_PROVIDERS, ...fromRegistry])];
  }, [models]);

  const providerModels = useMemo(
    () => models.filter((m) => m.provider === form.modelProvider),
    [models, form.modelProvider],
  );

  const effectiveModelId =
    form.modelId === CUSTOM_MODEL ? form.customModelId.trim() : form.modelId;

  const canSubmit =
    Boolean(form.name.trim()) && Boolean(userAddress) && !creating;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAddress) {
      setError("Connect a wallet before creating an agent.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          avatar: form.avatar || undefined,
          description: form.instructions.trim() || undefined,
          instructions: form.instructions.trim() || undefined,
          mode: "userDriven",
          common_tools: [],
          external_tools: [],
          owner: userAddress,
          runtimeType: form.runtimeType,
          runtimeConfig: {
            deploymentMode: "managed",
            channelPolicy: "pairing",
            memoryMode: "hybrid",
          },
          modelProvider: form.modelProvider,
          ...(effectiveModelId ? { modelId: effectiveModelId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.message || data?.error || "Failed to create agent",
        );
      }
      const agentId = data?.data?.agentId;
      router.push(agentId ? `/studio/agents/${agentId}` : "/studio/agents");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to create agent",
      );
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-slate-50">
      <div className="flex items-center gap-2 px-6 pb-3 pt-5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => router.push("/studio/agents")}
          aria-label="Back to agents"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageTitle title="Create New Agent" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <form
          onSubmit={handleSubmit}
          className="mx-auto grid w-full max-w-xl gap-6 px-6 pb-12 pt-4"
        >
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-5">
            <ImageUploader
              onImageChange={(imageUrl) =>
                setForm((f) => ({ ...f, avatar: imageUrl }))
              }
              defaultImage={form.avatar}
            />
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="My Awesome Agent"
                autoFocus
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="agent-instructions">
              Description & system prompt
            </Label>
            <Textarea
              id="agent-instructions"
              className="min-h-36"
              value={form.instructions}
              onChange={(e) =>
                setForm((f) => ({ ...f, instructions: e.target.value }))
              }
              placeholder="What is this agent for, and how should it behave?"
            />
            <p className="text-xs text-muted-foreground">
              You can refine behavior, tools, and advanced settings after the
              agent is created.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Runtime</Label>
            <Select
              value={form.runtimeType}
              onValueChange={(value: AgentRuntimeType) =>
                setForm((f) => ({ ...f, runtimeType: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="native">Agent Commons</SelectItem>
                <SelectItem value="openclaw">OpenClaw</SelectItem>
                <SelectItem value="hermes">Hermes</SelectItem>
                <SelectItem value="custom">Custom runtime</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {runtimeDescriptions[form.runtimeType] ??
                runtimeDescriptions.native}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Model provider</Label>
              <Select
                value={form.modelProvider}
                onValueChange={(value) =>
                  setForm((f) => ({
                    ...f,
                    modelProvider: value,
                    modelId: "",
                    customModelId: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Model</Label>
              <Select
                value={form.modelId}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, modelId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Provider default" />
                </SelectTrigger>
                <SelectContent>
                  {providerModels.map((model) => (
                    <SelectItem key={model.modelId} value={model.modelId}>
                      {model.displayName || model.modelId}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_MODEL}>
                    Type a model ID…
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.modelId === CUSTOM_MODEL && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="custom-model-id">Model ID</Label>
                <Input
                  id="custom-model-id"
                  value={form.customModelId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customModelId: e.target.value }))
                  }
                  placeholder="e.g. claude-sonnet-5"
                />
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 w-full gap-1.5"
          >
            {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {creating ? "Creating…" : "Create Agent"}
          </Button>
        </form>
      </div>
    </div>
  );
}
