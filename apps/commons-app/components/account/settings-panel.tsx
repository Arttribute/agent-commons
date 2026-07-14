"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  KeyRound,
  Cpu,
  User,
  Copy,
  Check,
  Trash2,
  Plus,
  BarChart2,
  CreditCard,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { UsageSection } from "@/components/account/usage-section";
import { BillingPanel } from "@/components/billing/billing-panel";

export const SETTINGS_SECTIONS = [
  "profile",
  "models",
  "billing",
  "api-keys",
  "usage",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const SECTION_LABELS: Record<SettingsSection, string> = {
  profile: "Profile",
  models: "Model Defaults",
  billing: "Billing",
  "api-keys": "API Keys",
  usage: "Usage",
};

const SECTION_ICONS: Record<SettingsSection, React.ElementType> = {
  profile: User,
  models: Cpu,
  billing: CreditCard,
  "api-keys": KeyRound,
  usage: BarChart2,
};

// ─── Profile Section ──────────────────────────────────────────────────────────
function ProfileSection({ walletAddress }: { walletAddress: string }) {
  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your account identity on Agent Commons
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Wallet address</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
              {walletAddress || "Not connected"}
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            Your wallet address is your identity. It cannot be changed.
          </p>
        </div>
        <div className="pt-2">
          <p className="text-xs text-muted-foreground">
            To use the CLI with this account, run{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">
              agc login
            </code>{" "}
            and enter your API key.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Model Defaults Section ───────────────────────────────────────────────────
interface ModelInfo {
  modelId: string;
  provider: string;
  name?: string;
  contextWindow?: number;
  costPer1kInputTokens?: number;
}

function ModelDefaultsSection() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        const raw = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
        const list: ModelInfo[] = raw.filter(
          (model: Partial<ModelInfo>) =>
            typeof model.modelId === "string" &&
            model.modelId.length > 0 &&
            typeof model.provider === "string" &&
            model.provider.length > 0,
        );
        setModels(list);
        const stored = localStorage.getItem("agc:model-defaults");
        if (stored) {
          try {
            const { provider, modelId } = JSON.parse(stored);
            if (provider) setSelectedProvider(provider);
            if (modelId) setSelectedModel(modelId);
          } catch {}
        } else if (list.length > 0) {
          setSelectedProvider(list[0].provider);
          setSelectedModel(list[0].modelId);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const providers = [...new Set(models.map((m) => m.provider))];
  const filteredModels = models.filter(
    (m) => !selectedProvider || m.provider === selectedProvider,
  );

  const handleSave = () => {
    localStorage.setItem(
      "agc:model-defaults",
      JSON.stringify({ provider: selectedProvider, modelId: selectedModel }),
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading)
    return (
      <div className="flex items-center gap-2 py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading models…</span>
      </div>
    );

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold">Model Defaults</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Default provider and model used when creating new agents
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Provider</Label>
          <Select
            value={selectedProvider}
            onValueChange={(v) => {
              setSelectedProvider(v);
              setSelectedModel("");
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Model</Label>
          <Select
            value={selectedModel}
            onValueChange={setSelectedModel}
            disabled={!selectedProvider}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {filteredModels.map((m) => (
                <SelectItem key={m.modelId} value={m.modelId}>
                  <span>{m.name ?? m.modelId}</span>
                  {m.contextWindow && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {(m.contextWindow / 1000).toFixed(0)}k ctx
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedModel && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
            {filteredModels
              .filter((m) => m.modelId === selectedModel)
              .map((m) => (
                <div key={m.modelId} className="flex gap-4 flex-wrap">
                  {m.contextWindow && (
                    <span>
                      Context: {m.contextWindow.toLocaleString()} tokens
                    </span>
                  )}
                  {m.costPer1kInputTokens != null && (
                    <span>Input: ${m.costPer1kInputTokens}/1K tokens</span>
                  )}
                </div>
              ))}
          </div>
        )}
        <Button size="sm" onClick={handleSave} disabled={!selectedModel}>
          {saved ? (
            <>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Saved
            </>
          ) : (
            "Save defaults"
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── API Keys Section ─────────────────────────────────────────────────────────
interface ApiKey {
  id: string;
  label?: string;
  createdAt: string;
  lastUsedAt?: string;
}

function ApiKeysSection({ walletAddress }: { walletAddress: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/api-keys?principalId=${encodeURIComponent(walletAddress)}&principalType=user`,
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data?.message ?? data?.error ?? "Failed to load API keys",
        );
      setKeys(
        Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [],
      );
    } catch {
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          principalId: walletAddress,
          principalType: "user",
          label: labelInput || undefined,
        }),
      });
      const data = await res.json();
      setNewKey(data.key ?? data.data?.key ?? null);
      setLabelInput("");
      await fetchKeys();
    } catch {
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      await fetchKeys();
    } catch {
    } finally {
      setRevoking(null);
    }
  };

  const handleCopy = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold">API Keys</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Keys for CLI and programmatic access
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Key label (optional)"
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          className="h-9 max-w-xs text-sm"
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
        />
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={generating || !walletAddress}
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Generate
            </>
          )}
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No API keys yet.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between rounded-md border border-border px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {k.label ?? (
                    <span className="text-muted-foreground italic">
                      Unlabeled
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(k.createdAt).toLocaleDateString()}
                  {k.lastUsedAt &&
                    ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRevoke(k.id)}
                disabled={revoking === k.id}
              >
                {revoking === k.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 text-destructive" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={!!newKey}
        onOpenChange={(open) => {
          if (!open) setNewKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy this key now — it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all select-all">
              {newKey}
            </code>
            <Button variant="outline" size="icon" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Use with CLI:{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
              agc login
            </code>
          </p>
          <Button className="mt-4 w-full" onClick={() => setNewKey(null)}>
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Reusable Settings Panel (nav + content) ──────────────────────────────────
export function SettingsPanel({
  walletAddress,
  initialSection = "profile",
  className,
}: {
  walletAddress: string;
  initialSection?: SettingsSection;
  className?: string;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);

  return (
    <div className={cn("flex min-h-0", className)}>
      {/* Account nav */}
      <div className="w-48 shrink-0 border-r border-border px-3 pt-6">
        <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Account
        </p>
        <nav className="space-y-0.5">
          {SETTINGS_SECTIONS.map((s) => {
            const Icon = SECTION_ICONS[s];
            const active = section === s;
            return (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {SECTION_LABELS[s]}
              </button>
            );
          })}
        </nav>
      </div>
      {/* Content */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-8 py-8">
        {section === "profile" && (
          <ProfileSection walletAddress={walletAddress} />
        )}
        {section === "models" && <ModelDefaultsSection />}
        {section === "billing" && <BillingPanel />}
        {section === "api-keys" && (
          <ApiKeysSection walletAddress={walletAddress} />
        )}
        {section === "usage" && <UsageSection walletAddress={walletAddress} />}
      </div>
    </div>
  );
}
