"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { notifyUiPluginsChanged } from "@/lib/ui-plugin-events";
import {
  GLOBAL_APPS_SCOPE,
  useCommonsAppsStore,
} from "@/lib/commons-apps-store";
import { AppIcon } from "./app-icon";
import {
  CAPABILITY_GROUP_LABELS,
  UI_PLUGIN_CAPABILITIES,
  defaultApproval,
  isUiPluginCapabilityName,
  type UiPluginCapabilityDefinition,
  type UiPluginCapabilityName,
} from "./capabilities";
import type {
  UiPlugin,
  UiPluginApproval,
  UiPluginConnection,
  UiPluginGrants,
} from "./types";

type GrantDraft = {
  name: UiPluginCapabilityName;
  enabled: boolean;
  approval: UiPluginApproval;
  /** undefined = everything the app requested */
  resourceIds?: string[];
};

type Draft = {
  capabilities: GrantDraft[];
  agentDataAccess: UiPluginGrants["agentDataAccess"];
  chatEnabled: boolean;
};

/**
 * Review and edit what a Commons app may do. In review mode the footer enables
 * the app with these grants; otherwise it saves them.
 */
export function AppSettingsSheet({
  plugin,
  mode,
  open,
  onOpenChange,
  onUpdated,
}: {
  plugin: UiPlugin | null;
  mode: "review" | "settings";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (plugin: UiPlugin) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
        {plugin && (
          <AppSettingsBody
            key={`${plugin.pluginId}:${mode}`}
            plugin={plugin}
            mode={mode}
            onClose={() => onOpenChange(false)}
            onUpdated={onUpdated}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function AppSettingsBody({
  plugin,
  mode,
  onClose,
  onUpdated,
}: {
  plugin: UiPlugin;
  mode: "review" | "settings";
  onClose: () => void;
  onUpdated: (plugin: UiPlugin) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(plugin));
  const [saving, setSaving] = useState(false);
  const connections = plugin.manifest.connections ?? [];
  const requestsData = (plugin.manifest.capabilities ?? []).some((grant) =>
    grant.name.startsWith("data."),
  );
  const hasChat = Boolean(plugin.manifest.chat);

  const save = async () => {
    setSaving(true);
    const grants = {
      capabilities: draft.capabilities.map((grant) => ({
        name: grant.name,
        enabled: grant.enabled,
        approval: grant.approval,
        resourceIds: grant.resourceIds ?? [],
      })),
      agentDataAccess: draft.agentDataAccess,
      chatEnabled: draft.chatEnabled,
    };
    try {
      const response = await fetch(
        mode === "review"
          ? `/api/ui-plugins/${plugin.pluginId}/status`
          : `/api/ui-plugins/${plugin.pluginId}/settings/grants`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "review" ? { status: "active", grants } : grants,
          ),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || "Please try again.");
      }
      onUpdated(payload.data);
      notifyUiPluginsChanged({
        pluginId: plugin.pluginId,
        status: payload.data.status,
        plugin: payload.data,
      });
      if (mode === "review") await pinIfRoom(plugin.pluginId);
      toast({ title: mode === "review" ? `${plugin.name} is enabled` : "Saved" });
      onClose();
    } catch (error) {
      toast({
        title: mode === "review" ? "Could not enable app" : "Could not save",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SheetHeader className="space-y-0 border-b border-border px-5 py-4 text-left">
        <div className="flex items-center gap-3">
          <AppIcon plugin={plugin} size={36} />
          <div className="min-w-0">
            <SheetTitle className="truncate text-base">{plugin.name}</SheetTitle>
            <SheetDescription className="truncate text-xs">
              {mode === "review"
                ? "Review what this app can do before enabling it"
                : `v${plugin.version}${plugin.manifest.category ? ` · ${plugin.manifest.category}` : ""}`}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <Tabs defaultValue="access" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-5 mt-3 grid h-8 grid-cols-4 p-0.5">
          <TabsTrigger value="access" className="h-7 text-xs">
            Access
          </TabsTrigger>
          <TabsTrigger value="services" className="h-7 text-xs">
            Services
          </TabsTrigger>
          <TabsTrigger value="storage" className="h-7 text-xs">
            Storage
          </TabsTrigger>
          <TabsTrigger value="appearance" className="h-7 text-xs">
            Look
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <TabsContent value="access" className="mt-0 space-y-6">
            <AccessEditor plugin={plugin} draft={draft} onChange={setDraft} />
            {(hasChat || requestsData) && (
              <section className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Agents
                </h3>
                {hasChat && (
                  <SettingRow
                    title="Show in chat"
                    description={`Agents can bring this app into a conversation when: ${plugin.manifest.chat?.when}`}
                  >
                    <Switch
                      checked={draft.chatEnabled}
                      onCheckedChange={(chatEnabled) =>
                        setDraft((current) => ({ ...current, chatEnabled }))
                      }
                      aria-label="Show in chat"
                    />
                  </SettingRow>
                )}
                {requestsData && (
                  <div className="space-y-2">
                    <p className="text-sm">Agent access to app data</p>
                    <Segmented
                      value={draft.agentDataAccess}
                      options={[
                        { value: "none", label: "None" },
                        { value: "read", label: "Read" },
                        { value: "readwrite", label: "Read & write" },
                      ]}
                      onChange={(agentDataAccess) =>
                        setDraft((current) => ({ ...current, agentDataAccess }))
                      }
                    />
                  </div>
                )}
              </section>
            )}
          </TabsContent>

          <TabsContent value="services" className="mt-0">
            {connections.length ? (
              <ConnectionsEditor plugin={plugin} />
            ) : (
              <EmptyNote text="This app does not call external services." />
            )}
          </TabsContent>

          <TabsContent value="storage" className="mt-0">
            {requestsData ? (
              <StorageEditor plugin={plugin} />
            ) : (
              <EmptyNote text="This app does not store data." />
            )}
          </TabsContent>

          <TabsContent value="appearance" className="mt-0">
            <AppearanceEditor plugin={plugin} onUpdated={onUpdated} />
          </TabsContent>
        </div>
      </Tabs>

      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {mode === "review" ? "Enable app" : "Save"}
        </Button>
      </div>
    </>
  );
}

function initialDraft(plugin: UiPlugin): Draft {
  const requested = (plugin.manifest.capabilities ?? []).filter((grant) =>
    isUiPluginCapabilityName(grant.name),
  );
  const granted = plugin.grants?.capabilities;
  return {
    capabilities: requested.map((request) => {
      const name = request.name as UiPluginCapabilityName;
      const grant = granted?.find((candidate) => candidate.name === name);
      return {
        name,
        enabled: granted ? Boolean(grant) : true,
        approval: grant?.approval ?? defaultApproval(name),
        resourceIds: grant?.resourceIds?.length ? grant.resourceIds : undefined,
      };
    }),
    agentDataAccess: plugin.grants?.agentDataAccess ?? "none",
    chatEnabled: plugin.grants?.chatEnabled ?? true,
  };
}

async function pinIfRoom(pluginId: string) {
  const store = useCommonsAppsStore.getState();
  const current = store.layout[GLOBAL_APPS_SCOPE] ?? [];
  if (current.includes(pluginId) || current.length >= store.maxPinned) return;
  await store.setPins(GLOBAL_APPS_SCOPE, [...current, pluginId]).catch(() => undefined);
}

function AccessEditor({
  plugin,
  draft,
  onChange,
}: {
  plugin: UiPlugin;
  draft: Draft;
  onChange: (updater: (draft: Draft) => Draft) => void;
}) {
  if (!draft.capabilities.length) {
    return (
      <EmptyNote text="This app only displays its own interface. It cannot read or change anything in Commons." />
    );
  }
  const groups = Object.entries(CAPABILITY_GROUP_LABELS)
    .map(([group, label]) => ({
      label,
      grants: draft.capabilities.filter(
        (grant) => UI_PLUGIN_CAPABILITIES[grant.name].group === group,
      ),
    }))
    .filter((group) => group.grants.length);

  const update = (name: UiPluginCapabilityName, patch: Partial<GrantDraft>) =>
    onChange((current) => ({
      ...current,
      capabilities: current.capabilities.map((grant) =>
        grant.name === name ? { ...grant, ...patch } : grant,
      ),
    }));

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.label} className="space-y-1">
          <h3 className="pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
          </h3>
          {group.grants.map((grant) => (
            <GrantRow
              key={grant.name}
              plugin={plugin}
              grant={grant}
              onChange={(patch) => update(grant.name, patch)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function GrantRow({
  plugin,
  grant,
  onChange,
}: {
  plugin: UiPlugin;
  grant: GrantDraft;
  onChange: (patch: Partial<GrantDraft>) => void;
}) {
  const definition = UI_PLUGIN_CAPABILITIES[
    grant.name
  ] as UiPluginCapabilityDefinition;
  const requestedScope = plugin.manifest.capabilities?.find(
    (candidate) => candidate.name === grant.name,
  )?.resourceIds;
  const options = useResourceOptions(plugin, definition.resource, requestedScope);
  const canScope = Boolean(options && options.length);
  const scoped = grant.resourceIds !== undefined;

  return (
    <div className="rounded-lg py-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm">{definition.label}</p>
            <AccessBadge access={definition.access} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {definition.description}
          </p>
        </div>
        <Switch
          checked={grant.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
          aria-label={definition.label}
        />
      </div>

      {grant.enabled && (definition.access !== "read" || canScope) && (
        <div className="mt-2 space-y-2 border-l border-border pl-3">
          {definition.access !== "read" && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {grant.name === "network.request"
                  ? "Requests that change data"
                  : "Each time it runs"}
              </span>
              <Segmented
                size="sm"
                value={grant.approval}
                options={[
                  { value: "ask", label: "Ask me" },
                  { value: "auto", label: "Allow" },
                ]}
                onChange={(approval) => onChange({ approval })}
              />
            </div>
          )}
          {canScope && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Applies to</span>
                <Segmented
                  size="sm"
                  value={scoped ? "some" : "all"}
                  options={[
                    { value: "all", label: requestedScope?.length ? "Requested" : "All" },
                    { value: "some", label: "Only selected" },
                  ]}
                  onChange={(value) =>
                    onChange({
                      resourceIds:
                        value === "all"
                          ? undefined
                          : (grant.resourceIds ?? options!.map((option) => option.id)),
                    })
                  }
                />
              </div>
              {scoped && (
                <div className="flex flex-wrap gap-1.5">
                  {options!.map((option) => {
                    const selected = grant.resourceIds!.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          onChange({
                            resourceIds: selected
                              ? grant.resourceIds!.filter((id) => id !== option.id)
                              : [...grant.resourceIds!, option.id],
                          })
                        }
                        className={cn(
                          "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                          selected
                            ? "border-foreground/20 bg-muted text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {selected && <Check className="h-3 w-3" />}
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ResourceOption = { id: string; label: string };

const resourceCache = new Map<string, Promise<ResourceOption[]>>();

/** Resources an owner can narrow a grant to. */
function useResourceOptions(
  plugin: UiPlugin,
  resource: string | undefined,
  requestedScope: string[] | undefined,
) {
  const [options, setOptions] = useState<ResourceOption[] | null>(null);
  useEffect(() => {
    let current = true;
    const limit = (items: ResourceOption[]) =>
      requestedScope?.length
        ? items.filter((item) => requestedScope.includes(item.id))
        : items;
    if (resource === "connection") {
      setOptions(
        limit(
          (plugin.manifest.connections ?? []).map((connection) => ({
            id: connection.key,
            label: connection.name,
          })),
        ),
      );
      return;
    }
    if (resource === "collection") {
      setOptions(
        limit(
          (plugin.manifest.data?.collections ?? []).map((collection) => ({
            id: collection.name,
            label: collection.name,
          })),
        ),
      );
      return;
    }
    const source =
      resource === "agent"
        ? { url: "/api/agents", id: "agentId", label: "name" }
        : resource === "workflow"
          ? { url: "/api/workflows", id: "workflowId", label: "name" }
          : null;
    if (!source) {
      setOptions(
        requestedScope?.length
          ? requestedScope.map((id) => ({ id, label: id }))
          : null,
      );
      return;
    }
    if (!resourceCache.has(source.url)) {
      resourceCache.set(
        source.url,
        fetch(source.url, { cache: "no-store" })
          .then((response) => response.json())
          .then((payload) =>
            (Array.isArray(payload) ? payload : (payload?.data ?? []))
              .filter((item: any) => item?.[source.id])
              .map((item: any) => ({
                id: String(item[source.id]),
                label: String(item[source.label] ?? item[source.id]),
              })),
          )
          .catch(() => {
            resourceCache.delete(source.url);
            return [];
          }),
      );
    }
    void resourceCache.get(source.url)!.then((items) => {
      if (current) setOptions(limit(items));
    });
    return () => {
      current = false;
    };
  }, [plugin, requestedScope, resource]);
  return options;
}

function ConnectionsEditor({ plugin }: { plugin: UiPlugin }) {
  const [items, setItems] = useState<
    Array<UiPluginConnection & { configured: boolean; enabled: boolean; secretHint: string | null }>
  | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    void fetch(`/api/ui-plugins/${plugin.pluginId}/settings/connections`, {
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((payload) => setItems(Array.isArray(payload?.data) ? payload.data : []))
      .catch(() => setItems([]));
  }, [plugin.pluginId]);

  const save = async (key: string, body: { secret?: string | null; enabled?: boolean }) => {
    const response = await fetch(
      `/api/ui-plugins/${plugin.pluginId}/settings/connections/${key}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast({
        title: "Could not update the connection",
        description: payload.message,
        variant: "destructive",
      });
      return false;
    }
    setItems(payload.data);
    return true;
  };

  if (!items) return <Loading />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Keys are encrypted and attached by Commons when the app makes a request.
        The app never sees them.
      </p>
      {items.map((connection) => (
        <ConnectionCard key={connection.key} connection={connection} onSave={save} />
      ))}
    </div>
  );
}

function ConnectionCard({
  connection,
  onSave,
}: {
  connection: UiPluginConnection & {
    configured: boolean;
    enabled: boolean;
    secretHint: string | null;
  };
  onSave: (key: string, body: { secret?: string | null; enabled?: boolean }) => Promise<boolean>;
}) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const needsKey = connection.auth.type !== "none";
  const host = safeHost(connection.baseUrl);

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm">{connection.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {host} · {connection.methods.join(", ")}
          </p>
          {connection.description && (
            <p className="mt-1 text-xs text-muted-foreground">{connection.description}</p>
          )}
        </div>
        <Switch
          checked={connection.enabled}
          onCheckedChange={(enabled) => void onSave(connection.key, { enabled })}
          aria-label={`Allow ${connection.name}`}
        />
      </div>
      {needsKey && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder={
                connection.configured
                  ? `Saved key ${connection.secretHint ?? ""}`
                  : connection.auth.type === "basic"
                    ? "username:password"
                    : "Paste API key"
              }
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!secret.trim() || busy}
              onClick={async () => {
                setBusy(true);
                if (await onSave(connection.key, { secret })) setSecret("");
                setBusy(false);
              }}
            >
              {connection.configured ? "Replace" : "Connect"}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className={connection.configured ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
              {connection.configured ? "Connected" : "Not connected"}
            </span>
            {connection.configured && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => void onSave(connection.key, { secret: null })}
              >
                Remove key
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type StorageState = {
  provider: "commons" | "supabase" | "mongodb";
  url: string | null;
  database: string | null;
  tablePrefix: string;
  secretHint: string | null;
  collections: Array<{ name: string; description?: string }>;
};

function StorageEditor({ plugin }: { plugin: UiPlugin }) {
  const { toast } = useToast();
  const [state, setState] = useState<StorageState | null>(null);
  const [provider, setProvider] = useState<StorageState["provider"]>("commons");
  const [url, setUrl] = useState("");
  const [database, setDatabase] = useState("");
  const [tablePrefix, setTablePrefix] = useState("");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const apply = useCallback((next: StorageState) => {
    setState(next);
    setProvider(next.provider);
    setUrl(next.url ?? "");
    setDatabase(next.database ?? "");
    setTablePrefix(next.tablePrefix ?? "");
    setSecret("");
  }, []);

  useEffect(() => {
    void fetch(`/api/ui-plugins/${plugin.pluginId}/settings/storage`, {
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((payload) => payload?.data && apply(payload.data))
      .catch(() => undefined);
  }, [apply, plugin.pluginId]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/ui-plugins/${plugin.pluginId}/settings/storage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          url,
          database,
          tablePrefix,
          ...(secret.trim() ? { secret } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Check the details and try again.");
      apply(payload.data);
      toast({ title: "Storage connected" });
    } catch (error) {
      toast({
        title: "Could not connect storage",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!state) return <Loading />;
  const changed =
    provider !== state.provider ||
    Boolean(secret.trim()) ||
    (provider !== "commons" &&
      (url !== (state.url ?? "") ||
        database !== (state.database ?? "") ||
        tablePrefix !== (state.tablePrefix ?? "")));

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        {(
          [
            { value: "commons", title: "Commons storage", text: "Managed by Commons. Nothing to set up." },
            { value: "supabase", title: "Supabase", text: "Rows in your own Supabase project." },
            { value: "mongodb", title: "MongoDB", text: "Documents in your own MongoDB database." },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={provider === option.value}
            onClick={() => setProvider(option.value)}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-left transition-colors",
              provider === option.value
                ? "border-foreground/30 bg-muted/60"
                : "border-border hover:bg-muted/40",
            )}
          >
            <span className="flex items-center justify-between text-sm">
              {option.title}
              {state.provider === option.value && (
                <span className="text-xs text-muted-foreground">In use</span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{option.text}</span>
          </button>
        ))}
      </div>

      {provider === "supabase" && (
        <div className="space-y-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-project.supabase.co" className="h-8 text-xs" />
          <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={state.provider === "supabase" && state.secretHint ? `Saved key ${state.secretHint}` : "Service role or anon key"} className="h-8 text-xs" />
          <Input value={tablePrefix} onChange={(e) => setTablePrefix(e.target.value)} placeholder="Table prefix (optional), e.g. trips_" className="h-8 text-xs" />
          <p className="text-xs text-muted-foreground">
            Create one table per collection with an <code>id</code> primary key
            {state.collections.length
              ? `: ${state.collections.map((collection) => `${tablePrefix}${collection.name}`).join(", ")}`
              : ""}
            .
          </p>
        </div>
      )}
      {provider === "mongodb" && (
        <div className="space-y-2">
          <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={state.provider === "mongodb" && state.secretHint ? `Saved: ${state.secretHint}` : "mongodb+srv://user:password@cluster/"} className="h-8 text-xs" />
          <Input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="Database name" className="h-8 text-xs" />
          <Input value={tablePrefix} onChange={(e) => setTablePrefix(e.target.value)} placeholder="Collection prefix (optional)" className="h-8 text-xs" />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Switching storage does not move existing records.
      </p>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" disabled={!changed || saving} onClick={save}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {provider === "commons" ? "Use Commons storage" : "Test and connect"}
        </Button>
      </div>
    </div>
  );
}

function AppearanceEditor({
  plugin,
  onUpdated,
}: {
  plugin: UiPlugin;
  onUpdated: (plugin: UiPlugin) => void;
}) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const update = async (iconUrl: string | null) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/ui-plugins/${plugin.pluginId}/settings/appearance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconUrl }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Please try another image.");
      onUpdated(payload.data);
      notifyUiPluginsChanged({ pluginId: plugin.pluginId, status: payload.data.status, plugin: payload.data });
    } catch (error) {
      toast({
        title: "Could not update the icon",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <AppIcon plugin={plugin} size={56} />
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
              <Upload className="mr-2 h-3.5 w-3.5" /> Upload icon
            </Button>
            {plugin.iconUrl && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void update(null)}>
                Reset
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Square PNG, JPEG, WebP or SVG, under 96 KB.</p>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > 96_000) {
            toast({ title: "Icons must be smaller than 96 KB", variant: "destructive" });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => void update(String(reader.result));
          reader.readAsDataURL(file);
        }}
      />
    </div>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md transition-colors",
            size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AccessBadge({ access }: { access: "read" | "write" | "external" }) {
  const label = access === "read" ? "Read" : access === "write" ? "Write" : "External";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-px text-[10px] font-medium",
        access === "read" && "bg-muted text-muted-foreground",
        access === "write" && "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
        access === "external" && "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
      )}
    >
      {label}
    </span>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">{text}</p>;
}

function Loading() {
  return (
    <div className="flex h-24 items-center justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function safeHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

export function useAccessSummary(plugin: UiPlugin) {
  return useMemo(() => {
    const grants = plugin.status === "active"
      ? (plugin.effectiveCapabilities ?? plugin.manifest.capabilities ?? [])
      : (plugin.manifest.capabilities ?? []);
    let read = 0;
    let write = 0;
    for (const grant of grants) {
      if (!isUiPluginCapabilityName(grant.name)) continue;
      if (UI_PLUGIN_CAPABILITIES[grant.name].access === "read") read += 1;
      else write += 1;
    }
    return { read, write, services: plugin.manifest.connections?.length ?? 0 };
  }, [plugin]);
}
