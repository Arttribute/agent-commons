"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Brain,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  CreditCard,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  FolderTree,
  Github,
  Globe2,
  KeyRound,
  ListChecks,
  ListTodo,
  Loader2,
  Mail,
  MessageSquare,
  MessagesSquare,
  MoreVertical,
  Palette,
  PanelTopOpen,
  Pencil,
  PlugZap,
  Presentation,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Table2,
  Trash2,
  Users,
  UsersRound,
  Workflow,
  Wrench,
} from "lucide-react";
import type { Tool } from "@/types/tool";
import type { ToolCatalogItem } from "@/lib/tools/catalog";
import { EditToolDialog } from "@/components/tools/management/edit-tool-dialog";
import { ManageKeysDialog } from "@/components/tools/management/manage-keys-dialog";
import { ManagePermissionsDialog } from "@/components/tools/management/manage-permissions-dialog";
import { McpServersView } from "@/components/mcp/mcp-servers-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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

const categoryOrder = [
  "google_workspace",
  "oauth",
  "mcp_api",
  "system",
  "custom",
  "agents",
  "workflows",
] as const;

const categoryCopy: Record<string, { title: string; description: string }> = {
  google_workspace: {
    title: "Google Workspace OAuth tools",
    description: "Visible first because these are the everyday tools agents need most.",
  },
  oauth: {
    title: "OAuth applications",
    description: "Connected with user consent and scoped account access.",
  },
  mcp_api: {
    title: "MCP/API integrations",
    description: "Verified and commonly used integrations for external systems.",
  },
  system: {
    title: "Platform tools",
    description: "Platform-supported capabilities that can be added to agents and workflows.",
  },
  custom: {
    title: "Custom tools",
    description: "Private and shared tools created in this workspace.",
  },
  agents: {
    title: "Agent processors",
    description: "Use an agent as a reasoning or delegation step in a workflow.",
  },
  workflows: {
    title: "Workflow invocations",
    description: "Reusable workflows that can be called from larger automations.",
  },
};

const iconMap: Record<string, React.ElementType> = {
  AlertCircle,
  Bot,
  Brain,
  CalendarDays,
  ClipboardList,
  Clock3,
  CreditCard,
  Database,
  FileText,
  FolderOpen,
  FolderTree,
  Github,
  Globe2,
  ListChecks,
  ListTodo,
  Mail,
  MessageSquare,
  MessagesSquare,
  Palette,
  PanelTopOpen,
  PlugZap,
  Presentation,
  Search,
  Table2,
  UsersRound,
  Workflow,
  Wrench,
};

const categoryFilters = [
  { value: "all", label: "All" },
  { value: "google_workspace", label: "Google" },
  { value: "oauth", label: "OAuth" },
  { value: "mcp_api", label: "MCP/API" },
  { value: "system", label: "Platform" },
  { value: "custom", label: "Custom" },
  { value: "agents", label: "Agents" },
  { value: "workflows", label: "Workflows" },
] as const;

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

function statusClass(status: ToolCatalogItem["status"]) {
  switch (status) {
    case "connected":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "available":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "needs_configuration":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "coming_soon":
      return "border-border bg-muted text-muted-foreground";
  }
}

function CatalogCard({
  item,
  onAction,
  onOpen,
  onEdit,
  onDelete,
  onManageKeys,
  onManagePermissions,
  actionLoading,
}: {
  item: ToolCatalogItem;
  onAction: (item: ToolCatalogItem) => void;
  onOpen: (item: ToolCatalogItem) => void;
  onEdit: (tool: Tool) => void;
  onDelete: (tool: Tool) => void;
  onManageKeys: (tool: Tool) => void;
  onManagePermissions: (tool: Tool) => void;
  actionLoading?: boolean;
}) {
  const Icon = iconMap[item.icon] ?? Wrench;
  const customTool = item.category === "custom" && item.tool;

  return (
    <div className="group flex min-h-[174px] flex-col rounded-lg border border-border bg-background p-4 transition-colors hover:border-foreground/25">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
          <Icon className="h-5 w-5 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{item.displayName}</h3>
            {item.verified && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {item.description}
          </p>
        </div>
        {customTool && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onOpen(item)}>
                <ExternalLink className="h-4 w-4" />
                Open
              </DropdownMenuItem>
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
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className={cn("h-5 text-[10px]", statusClass(item.status))}>
          {item.status === "connected" && <CheckCircle2 className="mr-1 h-3 w-3" />}
          {item.statusLabel}
        </Badge>
        <Badge variant="secondary" className="h-5 text-[10px]">
          {item.connectionMode}
        </Badge>
        {item.tags.slice(0, 2).map((tag) => (
          <Badge key={tag} variant="outline" className="h-5 text-[10px] text-muted-foreground">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <button
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => onOpen(item)}
        >
          View details
          <ArrowRight className="h-3 w-3" />
        </button>
        <Button
          size="sm"
          variant={item.status === "connected" ? "outline" : "default"}
          className="h-8"
          onClick={() => onAction(item)}
          disabled={actionLoading || item.status === "coming_soon"}
        >
          {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {item.actionLabel}
        </Button>
      </div>
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

function DetailsDialog({
  item,
  open,
  onOpenChange,
}: {
  item: ToolCatalogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;
  const Icon = iconMap[item.icon] ?? Wrench;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{item.displayName}</DialogTitle>
              <DialogDescription>{item.categoryLabel}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
          {item.oauthScopes?.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Requested scopes
              </p>
              <ScrollArea className="max-h-32 rounded-md border border-border bg-muted/25 p-3">
                <div className="space-y-1">
                  {item.oauthScopes.map((scope) => (
                    <code key={scope} className="block break-all text-xs text-muted-foreground">
                      {scope}
                    </code>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={statusClass(item.status)}>
              {item.statusLabel}
            </Badge>
            {item.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
          {item.documentationUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={item.documentationUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Documentation
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ToolsManagementView({ userAddress }: ToolsManagementViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState("catalog");
  const [items, setItems] = useState<ToolCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
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

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      return matchesCategory && itemMatches(item, searchQuery);
    });
  }, [items, categoryFilter, searchQuery]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ToolCatalogItem[]>();
    for (const category of categoryOrder) groups.set(category, []);
    for (const item of filteredItems) {
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
    return groups;
  }, [filteredItems]);

  const stats = useMemo(() => {
    return {
      connected: items.filter((item) => item.status === "connected").length,
      oauth: items.filter((item) => item.connectionMode === "oauth").length,
      mcp: items.filter((item) => item.connectionMode === "mcp").length,
      custom: items.filter((item) => item.category === "custom").length,
    };
  }, [items]);

  const handleAction = async (item: ToolCatalogItem) => {
    if (item.connectionMode === "oauth" && item.connectUrl) {
      router.push(item.connectUrl);
      return;
    }

    if (item.connectionMode === "mcp" && item.mcpTemplate) {
      const needsValues = Boolean(item.mcpTemplate.requiredEnv?.length || item.mcpTemplate.env);
      if (needsValues) {
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
      return;
    }

    if (item.agent?.agentId) {
      router.push(`/studio/agents/${item.agent.agentId}`);
      return;
    }

    if (item.workflow?.workflowId) {
      router.push(`/studio/workflows/${item.workflow.workflowId}/edit`);
      return;
    }

    setDetailsItem(item);
  };

  const handleOpen = (item: ToolCatalogItem) => {
    if (item.tool?.toolId) {
      router.push(`/studio/tools/${item.tool.toolId}`);
      return;
    }
    if (item.agent?.agentId) {
      router.push(`/studio/agents/${item.agent.agentId}`);
      return;
    }
    if (item.workflow?.workflowId) {
      router.push(`/studio/workflows/${item.workflow.workflowId}/edit`);
      return;
    }
    setDetailsItem(item);
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
    <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <TabsList className="w-fit border border-border bg-muted">
          <TabsTrigger value="catalog">Tool Catalog</TabsTrigger>
          <TabsTrigger value="mcp-servers">MCP Servers</TabsTrigger>
        </TabsList>
        {activeSubTab === "catalog" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadCatalog}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => router.push("/tools/create")}>
              <PlugZap className="h-4 w-4" />
              Create Tool
            </Button>
          </div>
        )}
      </div>

      <TabsContent value="catalog" className="mt-0">
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Connected", value: stats.connected, icon: CheckCircle2 },
            { label: "OAuth tools", value: stats.oauth, icon: ShieldCheck },
            { label: "MCP/API integrations", value: stats.mcp, icon: Settings2 },
            { label: "Custom tools", value: stats.custom, icon: PlugZap },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tools, providers, agents, workflows..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs value={categoryFilter} onValueChange={setCategoryFilter} className="overflow-x-auto">
            <TabsList className="border border-border bg-muted">
              {categoryFilters.map((filter) => (
                <TabsTrigger key={filter.value} value={filter.value}>
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-14 text-center">
            <p className="text-sm font-medium">No tools match your filters</p>
            <p className="mt-1 text-xs text-muted-foreground">Try a broader search or clear the category filter.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {categoryOrder.map((category) => {
              const sectionItems = groupedItems.get(category) ?? [];
              if (sectionItems.length === 0) return null;
              const copy = categoryCopy[category];
              return (
                <section key={category} className="space-y-3">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold tracking-tight">{copy.title}</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">{copy.description}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{sectionItems.length}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {sectionItems.map((item) => (
                      <CatalogCard
                        key={item.id}
                        item={item}
                        onAction={handleAction}
                        onOpen={handleOpen}
                        onEdit={setEditTool}
                        onDelete={setDeleteTool}
                        onManageKeys={setKeysTool}
                        onManagePermissions={setPermissionsTool}
                        actionLoading={actionLoadingId === item.id}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </TabsContent>

      <TabsContent value="mcp-servers" className="mt-0">
        <McpServersView ownerId={userAddress} ownerType="user" />
      </TabsContent>

      <McpQuickConnectDialog
        item={quickConnectItem}
        open={!!quickConnectItem}
        onOpenChange={(open) => !open && setQuickConnectItem(null)}
        onConnected={loadCatalog}
      />
      <DetailsDialog
        item={detailsItem}
        open={!!detailsItem}
        onOpenChange={(open) => !open && setDetailsItem(null)}
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
    </Tabs>
  );
}
