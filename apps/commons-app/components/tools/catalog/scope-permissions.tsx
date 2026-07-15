"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import type { ToolCatalogItem } from "@/lib/tools/catalog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Friendly names for well-known OAuth scopes; falls back to the scope's tail */
const SCOPE_LABELS: Record<string, { label: string; hint: string }> = {
  "tweet.read": {
    label: "Read posts",
    hint: "Read posts visible to the connected X account",
  },
  "tweet.write": {
    label: "Publish posts",
    hint: "Publish, reply to, quote, and delete posts after confirmation",
  },
  "users.read": {
    label: "Read profiles",
    hint: "Identify the connected account and public X profiles",
  },
  "offline.access": {
    label: "Stay connected",
    hint: "Refresh access without asking you to reconnect every two hours",
  },
  "https://www.googleapis.com/auth/gmail.readonly": {
    label: "Read email",
    hint: "Search and read messages",
  },
  "https://www.googleapis.com/auth/gmail.compose": {
    label: "Draft email",
    hint: "Create and update drafts",
  },
  "https://www.googleapis.com/auth/gmail.send": {
    label: "Send email",
    hint: "Send messages on your behalf",
  },
  "https://www.googleapis.com/auth/drive.file": {
    label: "Files it creates",
    hint: "Access only files created through the tool",
  },
  "https://www.googleapis.com/auth/drive.readonly": {
    label: "Read Drive files",
    hint: "Browse and read existing files",
  },
  "https://www.googleapis.com/auth/calendar.readonly": {
    label: "Read calendar",
    hint: "Check availability and list events",
  },
  "https://www.googleapis.com/auth/calendar.events": {
    label: "Manage events",
    hint: "Create and update events",
  },
  "https://www.googleapis.com/auth/documents": {
    label: "Read & write Docs",
    hint: "Create and edit documents",
  },
  "https://www.googleapis.com/auth/spreadsheets": {
    label: "Read & write Sheets",
    hint: "Read and update spreadsheets",
  },
  "https://www.googleapis.com/auth/presentations": {
    label: "Read & write Slides",
    hint: "Create and update presentations",
  },
  "https://www.googleapis.com/auth/chat.messages": {
    label: "Send chat messages",
    hint: "Post to Google Chat spaces",
  },
  "https://www.googleapis.com/auth/contacts.readonly": {
    label: "Read contacts",
    hint: "Look up people and contact details",
  },
  "https://www.googleapis.com/auth/tasks": {
    label: "Manage tasks",
    hint: "Create and update task lists",
  },
  "https://www.googleapis.com/auth/forms.body": {
    label: "Create & edit forms",
    hint: "Build forms and questions",
  },
};

export function scopeLabel(scope: string) {
  const known = SCOPE_LABELS[scope];
  if (known) return known;
  const tail = scope.split("/").pop() ?? scope;
  return { label: tail.replace(/[._-]/g, " "), hint: scope };
}

/**
 * Claude-connectors-style permission list for an OAuth tool: each scope is a
 * capability row with a toggle. Applying changes re-runs the OAuth consent
 * flow with exactly the selected scopes.
 */
export function ScopePermissions({
  item,
  returnUrl,
  title = "Permissions",
  subtitle,
}: {
  item: ToolCatalogItem;
  returnUrl: string;
  /** Panel heading — override to position this as account-level access */
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const requested = useMemo(() => item.oauthScopes ?? [], [item]);
  const granted = useMemo(
    () => new Set(item.grantedScopes ?? []),
    [item]
  );
  const connected = item.status === "connected";
  const providerUnavailable = item.status === "needs_configuration";

  useEffect(() => {
    // Connected: reflect what's actually granted. Not connected: propose all.
    setSelected(
      new Set(
        connected ? requested.filter((scope) => granted.has(scope)) : requested
      )
    );
  }, [item.id, connected, requested, granted]);

  if (requested.length === 0 || !item.authProviderKey) return null;

  const toggle = (scope: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const dirty =
    selected.size !== requested.filter((scope) => granted.has(scope)).length ||
    [...selected].some((scope) => !granted.has(scope));

  const apply = () => {
    if (selected.size === 0) return;
    setApplying(true);
    const url = `/oauth/connect?provider=${encodeURIComponent(item.authProviderKey!)}&scopes=${encodeURIComponent([...selected].join(" "))}&label=${encodeURIComponent(item.displayName)}&returnUrl=${encodeURIComponent(returnUrl)}`;
    router.push(url);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 pb-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {subtitle ?? `Choose what ${item.displayName} is allowed to do.`}
          </p>
        </div>
        <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="divide-y divide-border/70 rounded-xl border border-border">
        {requested.map((scope) => {
          const { label, hint } = scopeLabel(scope);
          const isGranted = granted.has(scope);
          return (
            <div key={scope} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm capitalize">{label}</p>
                  {connected && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[10px] font-medium",
                        isGranted
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-300/15 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {isGranted ? "granted" : "not granted"}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{hint}</p>
              </div>
              <Switch
                checked={selected.has(scope)}
                onCheckedChange={() => toggle(scope)}
                aria-label={`Allow: ${label}`}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-[11px] leading-4 text-muted-foreground">
          {providerUnavailable
            ? `${item.displayName} needs its platform OAuth app configured before accounts can connect.`
            : "Access is granted on your workspace connection and applies to agents that use this tool."}
        </p>
        <Button
          size="sm"
          className="h-8 shrink-0"
          onClick={apply}
          disabled={
            providerUnavailable ||
            applying ||
            selected.size === 0 ||
            (connected && !dirty)
          }
        >
          {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {providerUnavailable
            ? "Platform setup required"
            : connected
              ? "Update access"
              : "Connect"}
        </Button>
      </div>
    </div>
  );
}
