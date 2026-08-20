"use client";

import { useEffect, useState } from "react";
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
  Check,
  BarChart2,
  CreditCard,
  HardDrive,
  ShieldCheck,
  Globe2,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UsageSection } from "@/components/account/usage-section";
import { BillingPanel } from "@/components/billing/billing-panel";
import { DeveloperApiKeysSection } from "@/components/account/developer-api-keys-section";

export const SETTINGS_SECTIONS = [
  "profile",
  "models",
  "storage",
  "providers",
  "billing",
  "api-keys",
  "usage",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const SECTION_LABELS: Record<SettingsSection, string> = {
  profile: "Profile",
  models: "Model Defaults",
  storage: "Artifact Storage",
  providers: "Providers",
  billing: "Billing",
  "api-keys": "API Keys",
  usage: "Usage",
};

const SECTION_ICONS: Record<SettingsSection, React.ElementType> = {
  profile: User,
  models: Cpu,
  storage: HardDrive,
  providers: Plug,
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
          <Label className="text-xs">Commons account ID</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
              {walletAddress || "Not connected"}
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            This is your stable Commons account ID. It is shared across Agent
            Commons products.
          </p>
        </div>
        <div className="pt-2">
          <p className="text-xs text-muted-foreground">
            To use the CLI with this account, run{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">
              agc login
            </code>{" "}
            and approve the one-time browser sign-in. API keys are reserved for
            SDKs, servers, CI, and automation.
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
            model.provider.length > 0
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
    (m) => !selectedProvider || m.provider === selectedProvider
  );

  const handleSave = () => {
    localStorage.setItem(
      "agc:model-defaults",
      JSON.stringify({ provider: selectedProvider, modelId: selectedModel })
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

function ArtifactStorageSection() {
  const [provider, setProvider] = useState<"s3" | "ipfs">("s3");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/library/preferences/storage", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) =>
        setProvider(data?.defaultStorageProvider === "ipfs" ? "ipfs" : "s3")
      )
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (
      provider === "ipfs" &&
      !window.confirm(
        "IPFS files are publicly addressable and may persist after you remove them from Agent Commons. Use IPFS as your default?"
      )
    )
      return;
    setSaving(true);
    const response = await fetch("/api/library/preferences/storage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultStorageProvider: provider }),
    });
    setSaving(false);
    if (response.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">Artifact Storage</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Choose where new library artifacts are stored. You can override this
          for an individual upload.
        </p>
      </div>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <div className="space-y-3">
          <button
            onClick={() => setProvider("s3")}
            className={cn(
              "flex w-full gap-3 rounded-lg border p-4 text-left",
              provider === "s3" && "border-foreground ring-1 ring-foreground"
            )}
          >
            <ShieldCheck className="mt-0.5 h-5 w-5" />
            <span>
              <span className="block text-sm font-medium">
                Private S3{" "}
                <span className="ml-1 text-xs text-muted-foreground">
                  Recommended
                </span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Encrypted object storage with short-lived signed links. Files
                stay private unless you share them.
              </span>
            </span>
          </button>
          <button
            onClick={() => setProvider("ipfs")}
            className={cn(
              "flex w-full gap-3 rounded-lg border p-4 text-left",
              provider === "ipfs" && "border-amber-600 ring-1 ring-amber-600"
            )}
          >
            <Globe2 className="mt-0.5 h-5 w-5" />
            <span>
              <span className="block text-sm font-medium">IPFS via Pinata</span>
              <span className="mt-1 block text-xs text-amber-700">
                Publicly addressable and potentially persistent. Do not use for
                confidential, personal, or regulated data.
              </span>
            </span>
          </button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                Saved
              </>
            ) : (
              "Save storage default"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

type Capability = "web_search" | "computer" | "wallet";
type ProviderDefinition = {
  id: string;
  name: string;
  credentialFields: readonly string[];
  endpoint?: boolean;
};
type ProviderConfiguration = {
  capability: Capability;
  provider: string;
  endpointUrl?: string | null;
  settings?: Record<string, unknown>;
  hasCredentials?: boolean;
};

const CAPABILITY_COPY: Record<
  Capability,
  { label: string; description: string }
> = {
  web_search: {
    label: "Web search",
    description: "Choose how agents find current sources on the public web.",
  },
  computer: {
    label: "Agent computers",
    description:
      "Use CommonOS or connect an external computer runtime adapter.",
  },
  wallet: {
    label: "Wallets",
    description:
      "Choose the wallet custody and transaction adapter for new agents.",
  },
};

function CapabilityProvidersSection() {
  const [capability, setCapability] = useState<Capability>("web_search");
  const [catalog, setCatalog] = useState<Record<
    Capability,
    ProviderDefinition[]
  > | null>(null);
  const [configurations, setConfigurations] = useState<ProviderConfiguration[]>(
    []
  );
  const [provider, setProvider] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [settingsJson, setSettingsJson] = useState("{}");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/providers", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.message || payload?.error || "Could not load providers"
        );
      setCatalog(payload.catalog);
      setConfigurations(payload.configurations ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load providers"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!catalog) return;
    const current = configurations.find(
      (item) => item.capability === capability
    );
    const fallback = catalog[capability]?.[0]?.id ?? "";
    setProvider(current?.provider ?? fallback);
    setEndpointUrl(current?.endpointUrl ?? "");
    setSettingsJson(JSON.stringify(current?.settings ?? {}, null, 2));
    setCredentials({});
    setError("");
  }, [capability, catalog, configurations]);

  const definition = catalog?.[capability]?.find(
    (item) => item.id === provider
  );
  const current = configurations.find((item) => item.capability === capability);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      let settings: Record<string, unknown> = {};
      try {
        settings = JSON.parse(settingsJson || "{}");
      } catch {
        throw new Error("Advanced settings must be valid JSON");
      }
      const response = await fetch(`/api/providers/${capability}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          endpointUrl: endpointUrl || undefined,
          settings,
          credentials: Object.fromEntries(
            Object.entries(credentials).filter(([, value]) => value.trim())
          ),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          payload?.message || payload?.error || "Could not save provider"
        );
      setSaved(true);
      setTimeout(() => setSaved(false), 2_000);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save provider"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading && !catalog) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">Capability providers</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Plug in your preferred services without changing agent prompts or
          application code. Secrets are encrypted and are never returned by the
          API.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(CAPABILITY_COPY) as Capability[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCapability(item)}
            className={cn(
              "rounded-lg border p-3 text-left transition",
              capability === item
                ? "border-foreground ring-1 ring-foreground"
                : "hover:bg-muted/40"
            )}
          >
            <span className="block text-sm font-medium">
              {CAPABILITY_COPY[item].label}
            </span>
          </button>
        ))}
      </div>
      <div className="rounded-xl border p-5">
        <h3 className="text-sm font-medium">
          {CAPABILITY_COPY[capability].label}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {CAPABILITY_COPY[capability].description}
        </p>
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Provider</Label>
            <Select
              value={provider}
              onValueChange={(value) => {
                setProvider(value);
                setEndpointUrl("");
                setCredentials({});
                setSettingsJson("{}");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a provider" />
              </SelectTrigger>
              <SelectContent>
                {(catalog?.[capability] ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {definition?.endpoint && (
            <div className="space-y-1.5">
              <Label className="text-xs">HTTPS endpoint</Label>
              <Input
                type="url"
                value={endpointUrl}
                onChange={(event) => setEndpointUrl(event.target.value)}
                placeholder="https://provider.example.com/api"
              />
              <p className="text-xs text-muted-foreground">
                Private-network and insecure endpoints are rejected to prevent
                server-side request forgery.
              </p>
            </div>
          )}
          {(definition?.credentialFields ?? []).map((field) => (
            <div key={field} className="space-y-1.5">
              <Label className="text-xs">
                {field.replace(/([A-Z])/g, " $1")}
              </Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={credentials[field] ?? ""}
                onChange={(event) =>
                  setCredentials((value) => ({
                    ...value,
                    [field]: event.target.value,
                  }))
                }
                placeholder={
                  current?.hasCredentials
                    ? "Stored — enter a value to replace"
                    : "Required by provider"
                }
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label className="text-xs">Advanced settings (JSON)</Label>
            <textarea
              value={settingsJson}
              onChange={(event) => setSettingsJson(event.target.value)}
              className="min-h-28 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
              spellCheck={false}
            />
            {capability === "web_search" && provider === "custom" && (
              <p className="text-xs text-muted-foreground">
                Supports method, queryField, countField, apiKeyHeader,
                resultsPath, titlePath, urlPath, descriptionPath, and
                publishedAtPath.
              </p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={save} disabled={saving || !provider}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="mr-2 h-4 w-4" />
            ) : null}
            {saved ? "Saved" : "Save provider"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Reusable Settings Panel (nav + content) ──────────────────────────────────
export function SettingsPanel({
  walletAddress,
  workspaceId,
  initialSection = "profile",
  className,
}: {
  walletAddress: string;
  workspaceId?: string;
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
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
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
        {section === "storage" && <ArtifactStorageSection />}
        {section === "providers" && <CapabilityProvidersSection />}
        {section === "billing" && <BillingPanel />}
        {section === "api-keys" && (
          <DeveloperApiKeysSection workspaceId={workspaceId} />
        )}
        {section === "usage" && <UsageSection walletAddress={walletAddress} />}
      </div>
    </div>
  );
}
