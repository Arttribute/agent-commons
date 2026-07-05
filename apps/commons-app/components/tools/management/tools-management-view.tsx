"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ExternalLink,
  KeyRound,
  Loader2,
  MoreVertical,
  Pencil,
  PlugZap,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import type { Tool } from "@/types/tool";
import type { ToolCatalogItem } from "@/lib/tools/catalog";
import { EditToolDialog } from "@/components/tools/management/edit-tool-dialog";
import { ManageKeysDialog } from "@/components/tools/management/manage-keys-dialog";
import { ManagePermissionsDialog } from "@/components/tools/management/manage-permissions-dialog";
import { McpServersView } from "@/components/mcp/mcp-servers-view";
import { ToolIcon } from "@/components/tools/catalog/tool-icon";
import { ScopePermissions } from "@/components/tools/catalog/scope-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ToolsManagementViewProps {
  userAddress: string;
}

/** One tab row. Apps = OAuth-connected services; agents/workflows have their own pages. */
const FILTERS = [
  { value: "all", label: "All" },
  { value: "apps", label: "Apps" },
  { value: "mcp", label: "MCP" },
  { value: "platform", label: "Platform" },
  { value: "custom", label: "Custom" },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

function filterOf(item: ToolCatalogItem): FilterValue | null {
  switch (item.category) {
    case "google_workspace":
    case "oauth":
      return "apps";
    case "mcp_api":
      return "mcp";
    case "system":
      return "platform";
    case "custom":
      return "custom";
    default:
      return null; // agents & workflows live on their own pages
  }
}

const sectionTitles: Record<Exclude<FilterValue, "all">, string> = {
  apps: "Apps",
  mcp: "MCP integrations",
  platform: "Platform tools",
  custom: "Custom tools",
};

function itemMatches(item: ToolCatalogItem, query: string) {
  const value = query.trim().toLowerCase();
  if (!value) return true;
  return [
    item.displayName,
    item.description,
    item.categoryLabel,
    item.connectionMode,
    item.sourceLabel,
    ...item.tags,
  ]
    .filter(Boolean)
    .some((text) => String(text).toLowerCase().includes(value));
}

function ToolRow({
  item,
  onSelect,
  onEdit,
  onDelete,
  onManageKeys,
  onManagePermissions,
}: {
  item: ToolCatalogItem;
  onSelect: (item: ToolCatalogItem) => void;
  onEdit: (tool: Tool) => void;
  onDelete: (tool: Tool) => void;
  onManageKeys: (tool: Tool) => void;
  onManagePermissions: (tool: Tool) => void;
}) {
  const customTool = item.category === "custom" ? item.tool : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
      className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
    >
      <ToolIcon item={item} showConnected />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {item.displayName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {item.description}
        </p>
      </div>
      {customTool && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              onClick={(event) => event.stopPropagation()}
              aria-label="Tool actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onEdit(customTool)}>
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onManageKeys(customTool)}>
              <KeyRound className="h-4 w-4" />
              Keys
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onManagePermissions(customTool)}>
              <Users className="h-4 w-4" />
              Permissions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(customTool)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
    </div>
  );
}

function McpQuickConnectDialog({
  item,
  open,
  onOpenChange,
  onConnected,
}: {
  item: ToolCatalogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const env = item?.mcpTemplate?.env ?? {};
    setValues(Object.fromEntries(Object.entries(env).map(([key, value]) => [key, value || ""])));
  }, [item]);

  if (!item?.mcpTemplate) return null;
  const template = item.mcpTemplate;

  const required = template.requiredEnv ?? [];
  const submit = async () => {
    const missing = required.filter((key) => !values[key]?.trim());
    if (missing.length > 0) {
      toast({
        title: "Missing configuration",
        description: `Add ${missing.join(", ")} before connecting.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const replacePlaceholders = (value: string) =>
        Object.entries(values).reduce(
          (next, [key, envValue]) => next.replaceAll(`$${key}`, envValue),
          value,
        );

      const connectionConfig =
        template.connectionType === "sse"
          ? { url: template.url }
          : {
              command: template.command,
              args: template.args?.map(replacePlaceholders) ?? [],
              env: values,
            };

      const createRes = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.displayName,
          description: item.description,
          connectionType: template.connectionType,
          connectionConfig,
          tags: item.tags,
        }),
      });
      const server = await createRes.json();
      if (!createRes.ok) throw new Error(server.message || server.error || "Failed to create MCP server");

      const serverId = server.serverId || server.data?.serverId;
      if (serverId) {
        await fetch(`/api/mcp/servers/${serverId}/connect`, { method: "POST" });
        await fetch(`/api/mcp/servers/${serverId}/sync`, { method: "POST" });
      }

      toast({
        title: "MCP server connected",
        description: `${item.displayName} is ready for tool discovery.`,
      });
      onOpenChange(false);
      onConnected();
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message || "Could not connect MCP server.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure {item.displayName}</DialogTitle>
          <DialogDescription>
            Add the values needed to start and discover this MCP server.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div className="font-medium">{template.connectionType.toUpperCase()}</div>
            {template.command && (
              <code className="mt-1 block break-all text-muted-foreground">
                {template.command} {(template.args ?? []).join(" ")}
              </code>
            )}
            {template.url && (
              <code className="mt-1 block break-all text-muted-foreground">{template.url}</code>
            )}
          </div>
          {Object.keys(values).map((key) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`mcp-${key}`} className="text-xs">
                {key}
              </Label>
              <Input
                id={`mcp-${key}`}
                value={values[key] ?? ""}
                onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
                placeholder={required.includes(key) ? "Required" : "Optional"}
                type={key.toLowerCase().includes("token") || key.toLowerCase().includes("key") ? "password" : "text"}
              />
            </div>
          ))}
          {Object.keys(values).length === 0 && (
            <p className="text-sm text-muted-foreground">
              This server does not require extra values.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToolDetailsDialog({
  item,
  open,
  onOpenChange,
  onAction,
  actionLoading,
}: {
  item: ToolCatalogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (item: ToolCatalogItem) => void;
  actionLoading?: boolean;
}) {
  if (!item) return null;

  const isOauth = item.connectionMode === "oauth";
  const connected = item.status === "connected";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ToolIcon item={item} size="lg" showConnected />
            <div className="min-w-0">
              <DialogTitle className="truncate">{item.displayName}</DialogTitle>
              <DialogDescription className="flex items-center gap-1.5">
                {item.categoryLabel}
                <span aria-hidden>·</span>
                <span className={cn(connected && "text-emerald-600 dark:text-emerald-400")}>
                  {item.statusLabel}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>

          {isOauth ? (
            <ScopePermissions item={item} returnUrl="/studio/tools" />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-xs">
                {item.connectionMode}
              </Badge>
              {item.tags.slice(0, 4).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs text-muted-foreground">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            {item.documentationUrl ? (
              <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
                <a href={item.documentationUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Documentation
                </a>
              </Button>
            ) : (
              <span />
            )}
            {!isOauth && (
              <Button
                size="sm"
                variant={connected ? "outline" : "default"}
                onClick={() => onAction(item)}
                disabled={actionLoading || item.status === "coming_soon"}
              >
                {actionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {item.actionLabel}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ToolsManagementView({ userAddress }: ToolsManagementViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<ToolCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [quickConnectItem, setQuickConnectItem] = useState<ToolCatalogItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<ToolCatalogItem | null>(null);

  const [editTool, setEditTool] = useState<Tool | null>(null);
  const [keysTool, setKeysTool] = useState<Tool | null>(null);
  const [permissionsTool, setPermissionsTool] = useState<Tool | null>(null);
  const [deleteTool, setDeleteTool] = useState<Tool | null>(null);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tools/catalog", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load catalog");
      setItems(data.items ?? []);
    } catch (error: any) {
      toast({
        title: "Could not load tools",
        description: error.message || "Try refreshing the catalog.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userAddress) loadCatalog();
  }, [userAddress]);

  const grouped = useMemo(() => {
    const groups: Record<Exclude<FilterValue, "all">, ToolCatalogItem[]> = {
      apps: [],
      mcp: [],
      platform: [],
      custom: [],
    };
    for (const item of items) {
      const group = filterOf(item);
      if (!group || group === "all") continue;
      if (!itemMatches(item, searchQuery)) continue;
      groups[group].push(item);
    }
    return groups;
  }, [items, searchQuery]);

  const visibleSections = (
    filter === "all"
      ? (Object.keys(sectionTitles) as Array<Exclude<FilterValue, "all">>)
      : [filter as Exclude<FilterValue, "all">]
  ).filter((section) => grouped[section].length > 0);

  const handleAction = async (item: ToolCatalogItem) => {
    if (item.connectionMode === "mcp" && item.mcpTemplate) {
      const needsValues = Boolean(item.mcpTemplate.requiredEnv?.length || item.mcpTemplate.env);
      if (needsValues) {
        setDetailsItem(null);
        setQuickConnectItem(item);
        return;
      }

      setActionLoadingId(item.id);
      try {
        const createRes = await fetch("/api/mcp/servers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: item.displayName,
            description: item.description,
            connectionType: item.mcpTemplate.connectionType,
            connectionConfig:
              item.mcpTemplate.connectionType === "sse"
                ? { url: item.mcpTemplate.url }
                : {
                    command: item.mcpTemplate.command,
                    args: item.mcpTemplate.args ?? [],
                    env: item.mcpTemplate.env ?? {},
                  },
            tags: item.tags,
          }),
        });
        const server = await createRes.json();
        if (!createRes.ok) throw new Error(server.message || server.error || "Failed to connect");
        const serverId = server.serverId || server.data?.serverId;
        if (serverId) {
          await fetch(`/api/mcp/servers/${serverId}/connect`, { method: "POST" });
          await fetch(`/api/mcp/servers/${serverId}/sync`, { method: "POST" });
        }
        toast({ title: "MCP server connected", description: `${item.displayName} is ready.` });
        setDetailsItem(null);
        await loadCatalog();
      } catch (error: any) {
        toast({
          title: "Connection failed",
          description: error.message || "Could not connect MCP server.",
          variant: "destructive",
        });
      } finally {
        setActionLoadingId(null);
      }
      return;
    }

    if (item.tool?.toolId) {
      router.push(`/studio/tools/${item.tool.toolId}`);
    }
  };

  const handleSaveTool = async (updates: Partial<Tool>) => {
    if (!editTool) return;
    const response = await fetch(`/api/tools/${editTool.toolId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error("Failed to update tool");
    await loadCatalog();
    setEditTool(null);
  };

  const handleDeleteTool = async () => {
    if (!deleteTool) return;
    try {
      const response = await fetch(`/api/tools/${deleteTool.toolId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete tool");
      await loadCatalog();
      setDeleteTool(null);
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error.message || "Could not delete tool.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Search + one row of filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tools…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterValue)}>
          <TabsList className="h-9">
            {FILTERS.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value} className="text-xs">
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="space-y-2 py-2">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-72" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleSections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center">
          <p className="text-sm font-medium">No tools found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filter === "custom" && !searchQuery
              ? "Create a custom tool to see it here."
              : "Try a broader search or a different filter."}
          </p>
          {filter === "custom" && !searchQuery && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => router.push("/tools/create")}
            >
              <PlugZap className="h-3.5 w-3.5" />
              Create tool
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-7">
          {visibleSections.map((section) => (
            <section key={section}>
              {(filter === "all" || visibleSections.length > 1) && (
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {sectionTitles[section]}
                </p>
              )}
              <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                {grouped[section].map((item) => (
                  <ToolRow
                    key={item.id}
                    item={item}
                    onSelect={setDetailsItem}
                    onEdit={setEditTool}
                    onDelete={setDeleteTool}
                    onManageKeys={setKeysTool}
                    onManagePermissions={setPermissionsTool}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* Connected MCP servers are managed inline on the MCP view */}
          {filter === "mcp" && (
            <section className="border-t border-border/70 pt-6">
              <McpServersView ownerId={userAddress} ownerType="user" />
            </section>
          )}
        </div>
      )}

      <McpQuickConnectDialog
        item={quickConnectItem}
        open={!!quickConnectItem}
        onOpenChange={(open) => !open && setQuickConnectItem(null)}
        onConnected={loadCatalog}
      />
      <ToolDetailsDialog
        item={detailsItem}
        open={!!detailsItem}
        onOpenChange={(open) => !open && setDetailsItem(null)}
        onAction={handleAction}
        actionLoading={!!detailsItem && actionLoadingId === detailsItem.id}
      />

      <EditToolDialog
        tool={editTool}
        open={!!editTool}
        onClose={() => setEditTool(null)}
        onSave={handleSaveTool}
      />

      <ManageKeysDialog
        tool={keysTool}
        ownerId={userAddress}
        open={!!keysTool}
        onClose={() => setKeysTool(null)}
      />

      <ManagePermissionsDialog
        tool={permissionsTool}
        currentUserId={userAddress}
        open={!!permissionsTool}
        onClose={() => setPermissionsTool(null)}
      />

      <AlertDialog open={!!deleteTool} onOpenChange={() => setDeleteTool(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tool</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deleteTool?.displayName || deleteTool?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTool} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
