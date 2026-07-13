"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  Loader2,
  MessageCircle,
  Puzzle,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Unplug,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TagsInput } from "@/components/ui/tags-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentRuntimeType } from "@/types/agent";

export type RuntimeInfo = {
  runtimeType: AgentRuntimeType;
  status: string;
  managed: boolean;
  capabilities: Record<string, boolean>;
  config: {
    deploymentMode?: string;
    channelPolicy?: "pairing" | "allowlist" | "open" | "disabled";
    enabledPlugins?: string[];
    enabledToolsets?: string[];
    memoryMode?: "native" | "platform" | "hybrid";
    channels?: Record<
      string,
      {
        enabled: boolean;
        mode?: "bot" | "self-chat" | "cloud";
        dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
        allowFrom?: string[];
        requireMention?: boolean;
        homeTarget?: string;
        setupMethod?: "credentials" | "qr";
        configuredFields?: string[];
        configured?: boolean;
        needsPairing?: boolean;
      }
    >;
  };
};

type ChannelDraft = {
  enabled: boolean;
  mode: "bot" | "self-chat" | "cloud";
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom: string[];
  requireMention: boolean;
  homeTarget: string;
};

const DEFAULT_CHANNELS: Record<"telegram" | "whatsapp", ChannelDraft> = {
  telegram: {
    enabled: false,
    mode: "bot",
    dmPolicy: "allowlist",
    allowFrom: [],
    requireMention: true,
    homeTarget: "",
  },
  whatsapp: {
    enabled: false,
    mode: "bot",
    dmPolicy: "allowlist",
    allowFrom: [],
    requireMention: true,
    homeTarget: "",
  },
};

function findQr(value: unknown): string | null {
  if (typeof value === "string") {
    const match = value.match(
      /data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+/,
    );
    return match?.[0] ?? null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/qr(?:Data)?Url|qrCode|qr/i.test(key) && typeof child === "string") {
      return child;
    }
    const nested = findQr(child);
    if (nested) return nested;
  }
  return null;
}

function channelIsConnected(value: unknown) {
  const text = JSON.stringify(value ?? {}).toLowerCase();
  return (
    /"(?:connected|linked|loggedin|logged_in)":true/.test(text) ||
    /"status":"(?:connected|linked|ready|online)"/.test(text)
  );
}

/** Built-in tooling each managed runtime ships with, shown alongside the
 * Agent Commons catalog so both surfaces read as one system. */
export const RUNTIME_NATIVE_TOOLING: Record<
  "openclaw" | "hermes",
  {
    label: string;
    summary: string;
    builtIns: Array<{ name: string; description: string }>;
    bridgeNote: string;
    skillsNote: string;
  }
> = {
  openclaw: {
    label: "OpenClaw",
    summary:
      "OpenClaw runs on this agent's managed computer with its own gateway, plugins, and channel connectors.",
    builtIns: [
      { name: "browser", description: "Full browser automation" },
      {
        name: "workspace",
        description: "Persistent files and project context",
      },
      { name: "terminal", description: "Commands and development tasks" },
      { name: "web", description: "Web search and content retrieval" },
      { name: "memory", description: "OpenClaw's native memory store" },
      { name: "sessions", description: "Persistent gateway conversations" },
    ],
    bridgeNote:
      "Tools connected below are also reachable from OpenClaw through the computer's tool bridge — OpenClaw can list and call any of them mid-task.",
    skillsNote:
      "Skills are delivered to OpenClaw sessions as an index; OpenClaw pulls a skill's full instructions through the computer's tool bridge when a request matches.",
  },
  hermes: {
    label: "Hermes",
    summary:
      "Hermes runs on this agent's managed computer with its own full toolset and self-improving skills library.",
    builtIns: [
      { name: "terminal", description: "Shell access inside its runtime" },
      { name: "files", description: "Read and write workspace files" },
      { name: "browser", description: "Web browsing and scraping" },
      { name: "web-search", description: "Built-in web search" },
      { name: "memory", description: "Hermes' persistent memory store" },
      { name: "skills", description: "Self-authored reusable skills" },
    ],
    bridgeNote:
      "Tools connected below are also reachable from Hermes through the computer's tool bridge — Hermes can list and call any of them mid-task.",
    skillsNote:
      "Skills are delivered to Hermes sessions as an index; Hermes pulls a skill's full instructions through the computer's tool bridge. Hermes also keeps its own self-authored skills inside its runtime.",
  },
};

export function useAgentRuntime(agentId: string, enabled = true) {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/runtime`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (res.ok) setRuntime(payload.data as RuntimeInfo);
    } catch {
      // Runtime info is progressive enhancement — views fall back to AGC-only.
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (
      !enabled ||
      !runtime ||
      !["provisioning", "starting"].includes(runtime.status)
    ) {
      return;
    }
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [enabled, refresh, runtime]);

  return { runtime, loading, refresh, setRuntime };
}

export function managedRuntimeKey(
  runtime: RuntimeInfo | null,
): "openclaw" | "hermes" | null {
  if (runtime?.runtimeType === "openclaw") return "openclaw";
  if (runtime?.runtimeType === "hermes") return "hermes";
  return null;
}

/** Detail panel for the pinned "native tooling" entry in the agent Tools view. */
export function RuntimeNativeToolingDetail({
  runtime,
}: {
  agentId: string;
  runtime: RuntimeInfo;
  onUpdated: (runtime: RuntimeInfo) => void;
}) {
  const key = managedRuntimeKey(runtime);
  if (!key) return null;
  const meta = RUNTIME_NATIVE_TOOLING[key];

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <Server className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">
              {meta.label} built-in tooling
            </h3>
            <Badge
              variant="secondary"
              className="h-5 rounded-md px-1.5 text-[11px] font-normal"
            >
              {runtime.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{meta.summary}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Comes with {meta.label}
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {meta.builtIns.map((tool) => (
            <div
              key={tool.name}
              className="flex items-center gap-2.5 rounded-lg border border-border/70 px-2.5 py-2"
            >
              <Puzzle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{tool.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {tool.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
        {meta.bridgeNote}
      </p>

      <p className="text-[11px] text-muted-foreground">
        Runtime-specific configuration lives in Agent setup. This view only
        describes the tools provided by {meta.label} and the Agent Commons tool
        bridge.
      </p>
    </div>
  );
}

/** Runtime-specific settings shown in Agent setup. Native agents deliberately
 * do not render this panel because their model and generation settings already
 * live in the native setup form. */
export function ManagedRuntimeSetup({
  agentId,
  isOwner,
}: {
  agentId: string;
  isOwner: boolean;
}) {
  const { runtime, loading, setRuntime, refresh } = useAgentRuntime(agentId);
  const key = managedRuntimeKey(runtime);
  const [channelPolicy, setChannelPolicy] = useState<
    "pairing" | "allowlist" | "open" | "disabled"
  >("pairing");
  const [memoryMode, setMemoryMode] = useState<
    "native" | "platform" | "hybrid"
  >("hybrid");
  const [toolsetPreset, setToolsetPreset] = useState("hermes-cli");
  const [channels, setChannels] = useState(DEFAULT_CHANNELS);
  const [selectedChannel, setSelectedChannel] = useState<
    "telegram" | "whatsapp" | null
  >(null);
  const [telegramToken, setTelegramToken] = useState("");
  const [whatsappSecrets, setWhatsappSecrets] = useState({
    phoneNumberId: "",
    accessToken: "",
    appSecret: "",
    verifyToken: "",
  });
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [channelBusy, setChannelBusy] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runtime) return;
    setChannelPolicy(runtime.config.channelPolicy ?? "pairing");
    setMemoryMode(runtime.config.memoryMode ?? "hybrid");
    setToolsetPreset(runtime.config.enabledToolsets?.[0] ?? "hermes-cli");
    setChannels((current) => {
      const next = { ...current };
      for (const id of ["telegram", "whatsapp"] as const) {
        const configured = runtime.config.channels?.[id];
        next[id] = {
          ...DEFAULT_CHANNELS[id],
          ...(id === "whatsapp" && runtime.runtimeType === "hermes"
            ? { mode: "cloud" as const }
            : {}),
          ...(configured ?? {}),
          allowFrom: configured?.allowFrom ?? [],
          homeTarget: configured?.homeTarget ?? "",
        };
      }
      return next;
    });
  }, [runtime]);

  useEffect(() => {
    if (!qrCode || whatsappConnected) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/agents/${agentId}/runtime/channels/whatsapp/status`,
          { method: "POST" },
        );
        const payload = await response.json();
        if (response.ok && channelIsConnected(payload)) {
          setWhatsappConnected(true);
          setQrCode(null);
          void refresh();
        }
      } catch {
        // Keep the QR visible; the next lightweight probe can recover.
      }
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [agentId, qrCode, refresh, whatsappConnected]);

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!runtime || !key) return null;
  const meta = RUNTIME_NATIVE_TOOLING[key];

  const updateChannel = (
    id: "telegram" | "whatsapp",
    patch: Partial<ChannelDraft>,
  ) => {
    setChannels((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agentId}/runtime`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            ...runtime.config,
            memoryMode,
            ...(key === "openclaw" ? { channelPolicy } : {}),
            ...(key === "hermes" ? { enabledToolsets: [toolsetPreset] } : {}),
            channels: {
              telegram: {
                ...channels.telegram,
                dmPolicy: key === "openclaw" ? channelPolicy : "allowlist",
                credentials: telegramToken.trim()
                  ? { botToken: telegramToken.trim() }
                  : {},
              },
              whatsapp: {
                ...channels.whatsapp,
                dmPolicy: key === "openclaw" ? channelPolicy : "allowlist",
                credentials: Object.fromEntries(
                  Object.entries(whatsappSecrets).filter(([, value]) =>
                    value.trim(),
                  ),
                ),
              },
            },
          },
          deploy: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload?.message ||
            payload?.error ||
            "Could not apply runtime settings",
        );
      }
      setRuntime(payload.data as RuntimeInfo);
      setTelegramToken("");
      setWhatsappSecrets({
        phoneNumberId: "",
        accessToken: "",
        appSecret: "",
        verifyToken: "",
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      return payload.data as RuntimeInfo;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not apply runtime settings",
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const connectWhatsapp = async () => {
    if (key !== "openclaw") return;
    setChannelBusy(true);
    setError(null);
    setQrCode(null);
    setWhatsappConnected(false);
    try {
      const updated = await save();
      if (!updated) return;
      let ready = updated.status === "ready";
      for (let attempt = 0; !ready && attempt < 45; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        const runtimeResponse = await fetch(`/api/agents/${agentId}/runtime`, {
          cache: "no-store",
        });
        const runtimePayload = await runtimeResponse.json();
        if (!runtimeResponse.ok) continue;
        const nextRuntime = runtimePayload.data as RuntimeInfo;
        setRuntime(nextRuntime);
        if (nextRuntime.status === "failed") {
          throw new Error("OpenClaw could not start for WhatsApp pairing");
        }
        ready = nextRuntime.status === "ready";
      }
      if (!ready) throw new Error("OpenClaw is taking too long to start");
      const response = await fetch(
        `/api/agents/${agentId}/runtime/channels/whatsapp/connect`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload?.message ?? payload?.error ?? "Could not start pairing",
        );
      }
      if (payload?.data?.status === "starting")
        throw new Error(
          "OpenClaw is still starting. Try pairing again in a moment.",
        );
      const qr = findQr(payload);
      if (!qr) throw new Error("OpenClaw did not return a pairing code");
      setQrCode(qr);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start pairing",
      );
    } finally {
      setChannelBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <Server className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{meta.label}</p>
            <Badge
              variant="secondary"
              className="h-5 rounded-md px-1.5 text-[11px]"
            >
              {runtime.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{meta.summary}</p>
        </div>
      </div>

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">Messaging channels</p>
            <p className="text-[11px] text-muted-foreground">
              Reach this agent outside Agent Commons.
            </p>
          </div>
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        </div>

        {(["telegram", "whatsapp"] as const).map((id) => {
          const info = runtime.config.channels?.[id];
          const active = channels[id].enabled;
          const Icon = id === "telegram" ? Send : MessageCircle;
          const status =
            id === "whatsapp" && whatsappConnected
              ? "Connected"
              : info?.configured && !info.needsPairing
                ? "Configured"
                : active
                  ? "Setup needed"
                  : "Off";
          return (
            <div key={id} className="border-b border-border/70 last:border-b-0">
              <button
                type="button"
                className="flex w-full items-center gap-3 py-3 text-left"
                onClick={() =>
                  setSelectedChannel((current) => (current === id ? null : id))
                }
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/30">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium capitalize">
                    {id}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {id === "telegram"
                      ? "Bot token"
                      : key === "openclaw"
                        ? "Linked device"
                        : "Business Cloud API"}
                  </span>
                </span>
                <Badge
                  variant={
                    status === "Connected" || status === "Configured"
                      ? "secondary"
                      : "outline"
                  }
                  className="h-5 rounded-md px-1.5 text-[10px] font-normal"
                >
                  {status}
                </Badge>
                <ChevronRight
                  className={`h-4 w-4 text-muted-foreground transition-transform ${selectedChannel === id ? "rotate-90" : ""}`}
                />
              </button>

              {selectedChannel === id && (
                <div className="grid gap-3 pb-4 pl-11">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">Enabled</p>
                    <Switch
                      checked={channels[id].enabled}
                      disabled={!isOwner || saving}
                      onCheckedChange={(enabled) =>
                        updateChannel(id, { enabled })
                      }
                    />
                  </div>

                  {id === "telegram" && (
                    <>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Bot token
                        <Input
                          type="password"
                          autoComplete="new-password"
                          value={telegramToken}
                          disabled={!isOwner || saving}
                          placeholder={
                            info?.configuredFields?.includes("botToken")
                              ? "Token saved"
                              : "123456789:..."
                          }
                          onChange={(event) =>
                            setTelegramToken(event.target.value)
                          }
                        />
                      </label>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Allowed Telegram user IDs
                        <TagsInput
                          value={channels.telegram.allowFrom}
                          disabled={!isOwner || saving}
                          onChange={(allowFrom) =>
                            updateChannel("telegram", { allowFrom })
                          }
                          placeholder="Add numeric user ID"
                        />
                      </label>
                    </>
                  )}

                  {id === "whatsapp" && key === "openclaw" && (
                    <>
                      <div className="grid grid-cols-2 rounded-md border p-0.5">
                        {(["bot", "self-chat"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            className={`h-7 rounded px-2 text-[11px] font-medium ${channels.whatsapp.mode === mode ? "bg-muted" : "text-muted-foreground"}`}
                            onClick={() => updateChannel("whatsapp", { mode })}
                          >
                            {mode === "bot" ? "Bot number" : "My number"}
                          </button>
                        ))}
                      </div>
                      <label className="grid gap-1.5 text-xs font-medium">
                        Allowed WhatsApp numbers
                        <TagsInput
                          value={channels.whatsapp.allowFrom}
                          disabled={!isOwner || saving}
                          onChange={(allowFrom) =>
                            updateChannel("whatsapp", { allowFrom })
                          }
                          placeholder="+254..."
                        />
                      </label>
                      {qrCode ? (
                        <div className="grid justify-items-center gap-2 border-t pt-3">
                          {qrCode.startsWith("data:image/") ? (
                            <img
                              src={qrCode}
                              alt="WhatsApp pairing code"
                              className="h-52 w-52 bg-white object-contain p-2"
                            />
                          ) : (
                            <pre className="max-w-full overflow-auto bg-white p-2 text-[8px] leading-none text-black">
                              {qrCode}
                            </pre>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            WhatsApp Settings → Linked devices → Link a device
                          </p>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-fit gap-1.5"
                          disabled={
                            !isOwner ||
                            channelBusy ||
                            !channels.whatsapp.enabled
                          }
                          onClick={() => void connectWhatsapp()}
                        >
                          {channelBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : whatsappConnected ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Unplug className="h-3.5 w-3.5" />
                          )}
                          {whatsappConnected ? "Connected" : "Pair WhatsApp"}
                        </Button>
                      )}
                    </>
                  )}

                  {id === "whatsapp" && key === "hermes" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["phoneNumberId", "Phone number ID"],
                          ["accessToken", "Access token"],
                          ["appSecret", "App secret"],
                          ["verifyToken", "Verify token"],
                        ] as const
                      ).map(([field, label]) => (
                        <label
                          key={field}
                          className="grid gap-1.5 text-xs font-medium"
                        >
                          {label}
                          <Input
                            type={
                              field === "phoneNumberId" ? "text" : "password"
                            }
                            value={whatsappSecrets[field]}
                            disabled={!isOwner || saving}
                            placeholder={
                              info?.configuredFields?.includes(field)
                                ? "Saved"
                                : field === "phoneNumberId"
                                  ? "15-17 digit ID"
                                  : "Required"
                            }
                            onChange={(event) =>
                              setWhatsappSecrets((current) => ({
                                ...current,
                                [field]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {key === "openclaw" && (
        <div className="grid max-w-sm gap-1.5">
          <p className="text-xs font-medium">Default message access</p>
          <Select
            value={channelPolicy}
            disabled={!isOwner || saving}
            onValueChange={(value) =>
              setChannelPolicy(value as typeof channelPolicy)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pairing">Pair new senders</SelectItem>
              <SelectItem value="allowlist">Allowed people only</SelectItem>
              <SelectItem value="open">Anyone</SelectItem>
              <SelectItem value="disabled">No direct messages</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {key === "hermes" && (
        <div className="grid gap-2">
          <p className="text-xs font-medium">Built-in tool access</p>
          <div className="grid grid-cols-3 rounded-md border p-0.5">
            {[
              ["hermes-cli", "Full"],
              ["coding", "Coding"],
              ["safe", "Research"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                title={`${label} Hermes tool preset`}
                className={`h-8 rounded px-2 text-[11px] font-medium ${toolsetPreset === value ? "bg-muted" : "text-muted-foreground"}`}
                disabled={!isOwner || saving}
                onClick={() => setToolsetPreset(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid max-w-sm gap-1.5">
        <p className="text-xs font-medium">Memory context</p>
        <Select
          value={memoryMode}
          disabled={!isOwner || saving}
          onValueChange={(value) => setMemoryMode(value as typeof memoryMode)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hybrid">
              Runtime + Agent Commons memory
            </SelectItem>
            <SelectItem value="platform">
              Agent Commons context preferred
            </SelectItem>
            <SelectItem value="native">Runtime memory only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <div>
        <Button
          size="sm"
          className="h-8 gap-1.5"
          disabled={!isOwner || saving}
          onClick={() => void save()}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : null}
          {saved ? "Applied" : "Save & restart runtime"}
        </Button>
      </div>
    </div>
  );
}

/** Compact banner for the Skills view when a managed runtime is active. */
export function RuntimeSkillsNote({
  runtime,
}: {
  runtime: RuntimeInfo | null;
}) {
  const key = managedRuntimeKey(runtime);
  if (!key) return null;
  const meta = RUNTIME_NATIVE_TOOLING[key];
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{meta.skillsNote}</p>
    </div>
  );
}
