"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, MessageSquare, ShieldCheck, Sparkles, X } from "lucide-react";
import { AgentProvider } from "@/context/AgentContext";
import { useAuth } from "@/context/AuthContext";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import SessionInterface from "@/components/sessions/session-interface";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { CopilotChangeList, type CopilotChange } from "./copilot-change-list";

type CopilotAgent = {
  agentId: string;
  name: string;
  avatar?: string | null;
  greeting?: string;
  conversationStarters?: string[];
  persona?: string;
  instructions?: string;
  copilotAccessMode?: "full" | "scoped" | "confirm" | null;
  copilotScopes?: string[];
  [key: string]: any;
};

const SCOPES = [
  ["workflows", "Workflows"],
  ["agents", "Agents"],
  ["tools", "Tools"],
  ["skills", "Skills"],
  ["tasks", "Tasks"],
] as const;

export function FloatingCommonsCopilot() {
  return (
    <AgentProvider>
      <FloatingCommonsCopilotInner />
    </AgentProvider>
  );
}

function FloatingCommonsCopilotInner() {
  const pathname = usePathname();
  const { authenticated, ready, authState } = useAuth();
  const [copilot, setCopilot] = useState<CopilotAgent | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "review" | "access">("chat");
  const [sessionId, setSessionId] = useState("");
  const [changes, setChanges] = useState<CopilotChange[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<"full" | "scoped" | "confirm">("confirm");
  const [scopes, setScopes] = useState<string[]>([]);

  const hidden = useMemo(
    () =>
      !ready ||
      !authenticated ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/oauth") ||
      pathname.startsWith("/legal") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/terms"),
    [authenticated, pathname, ready],
  );

  const loadCopilot = useCallback(async () => {
    if (!authenticated) return;
    const response = await fetch("/api/copilot", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    const agent = payload?.data ?? null;
    setCopilot(agent);
    setMode(agent?.copilotAccessMode ?? "confirm");
    setScopes(Array.isArray(agent?.copilotScopes) ? agent.copilotScopes : []);
  }, [authenticated]);

  const loadChanges = useCallback(async () => {
    if (!authenticated) return;
    const response = await fetch("/api/copilot/changes", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setChanges(payload?.data ?? []);
  }, [authenticated]);

  useEffect(() => {
    loadCopilot();
  }, [loadCopilot, authState.userId]);

  useEffect(() => {
    if (!copilot) return;
    loadChanges();
    const timer = window.setInterval(loadChanges, 30_000);
    return () => window.clearInterval(timer);
  }, [copilot?.agentId, loadChanges]);

  useEffect(() => {
    if (!open) return;
    loadChanges();
    const timer = window.setInterval(loadChanges, 10_000);
    return () => window.clearInterval(timer);
  }, [loadChanges, open]);

  if (hidden || !copilot) return null;

  const pendingCount = changes.filter(
    (change) => change.status === "pending",
  ).length;
  const saveAccess = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch("/api/copilot/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessMode: mode, scopes }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.message || "Could not save access settings");
      setCopilot(payload.data);
      setMode(payload.data?.copilotAccessMode ?? "confirm");
      setScopes(
        Array.isArray(payload.data?.copilotScopes)
          ? payload.data.copilotScopes
          : [],
      );
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open Commons Copilot"
          onClick={() => {
            setOpen(true);
            setTab("chat");
            loadChanges();
          }}
          className="fixed bottom-5 right-5 z-40 rounded-full border border-border bg-background p-1 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
        >
          <AgentAvatar
            name={copilot.name}
            src={copilot.avatar || "/commons-copilot.png"}
            size={52}
          />
          <span className="absolute -left-1 -top-1 rounded-full bg-foreground p-1 text-background shadow">
            <Sparkles className="h-3 w-3" />
          </span>
          {pendingCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
              {pendingCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <aside className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[460px] flex-col border-l border-border bg-background shadow-2xl">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
            <AgentAvatar
              name={copilot.name}
              src={copilot.avatar || "/commons-copilot.png"}
              size={34}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{copilot.name}</p>
              <p className="text-[11px] text-muted-foreground">
                Native Agent Commons copilot
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
            {(
              [
                ["chat", MessageSquare, "Chat"],
                [
                  "review",
                  Check,
                  `Review${pendingCount ? ` (${pendingCount})` : ""}`,
                ],
                ["access", ShieldCheck, "Access"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition",
                  tab === value && "bg-muted text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1">
            {tab === "chat" && (
              <SessionInterface
                agent={copilot as any}
                session={null}
                agentId={copilot.agentId}
                sessionId={sessionId}
                userId={authState.userId || authState.walletAddress || ""}
                onSessionCreated={(createdSessionId) =>
                  setSessionId(createdSessionId)
                }
                header={null}
              />
            )}
            {tab === "review" && (
              <ScrollArea className="h-full">
                <div className="space-y-3 p-4">
                  <div>
                    <h2 className="text-sm font-semibold">Copilot changes</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Review pending edits or undo an automatically applied
                      change.
                    </p>
                  </div>
                  <CopilotChangeList
                    changes={changes}
                    onChanged={loadChanges}
                  />
                </div>
              </ScrollArea>
            )}
            {tab === "access" && (
              <ScrollArea className="h-full">
                <div className="space-y-5 p-4">
                  <div>
                    <h2 className="text-sm font-semibold">Access policy</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Choose when Commons Copilot may apply account changes
                      without asking.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {(
                      [
                        [
                          "confirm",
                          "Confirm every change",
                          "Nothing is applied until you approve it.",
                        ],
                        [
                          "scoped",
                          "Automatic in selected scopes",
                          "Selected resource types may change automatically.",
                        ],
                        [
                          "full",
                          "Full account access",
                          "Changes may apply immediately across the account and remain undoable.",
                        ],
                      ] as const
                    ).map(([value, title, description]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value)}
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition",
                          mode === value
                            ? "border-foreground bg-muted/50"
                            : "border-border hover:bg-muted/30",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "mt-0.5 h-3.5 w-3.5 rounded-full border",
                              mode === value && "border-4 border-foreground",
                            )}
                          />
                          <span>
                            <span className="block text-sm font-medium">
                              {title}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {description}
                            </span>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {mode === "scoped" && (
                    <div className="rounded-xl border border-border p-3">
                      <p className="mb-3 text-xs font-medium">
                        Automatic scopes
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {SCOPES.map(([value, label]) => (
                          <Label
                            key={value}
                            className="flex cursor-pointer items-center gap-2 text-xs font-normal"
                          >
                            <Checkbox
                              checked={scopes.includes(value)}
                              onCheckedChange={(checked) =>
                                setScopes((current) =>
                                  checked
                                    ? [...new Set([...current, value])]
                                    : current.filter(
                                        (scope) => scope !== value,
                                      ),
                                )
                              }
                            />
                            {label}
                          </Label>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    disabled={saving}
                    onClick={saveAccess}
                  >
                    {saved
                      ? "Saved"
                      : saving
                        ? "Saving…"
                        : "Save access policy"}
                  </Button>
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    Secrets, ownership, system instructions, and security
                    boundaries are never editable by the copilot.
                  </p>
                </div>
              </ScrollArea>
            )}
          </div>
        </aside>
      )}
    </>
  );
}

export default FloatingCommonsCopilot;
