"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Globe,
  KeyRound,
  Lock,
  Pencil,
  PlugZap,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ApiSpecBuilder } from "@/components/tools/api-spec-builder";
import { JsonSchemaEditor } from "@/components/tools/json-schema-editor";
import { EditToolDialog } from "@/components/tools/management/edit-tool-dialog";
import { ManageKeysDialog } from "@/components/tools/management/manage-keys-dialog";
import { ManagePermissionsDialog } from "@/components/tools/management/manage-permissions-dialog";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { normalizePrincipalId } from "@/lib/principal-id";
import type { Tool } from "@/types/tool";

const visibilityIcon = {
  private: Lock,
  public: Globe,
  platform: Building2,
};

function JsonBlock({ value }: { value: unknown }) {
  if (!value) {
    return (
      <p className="text-sm text-muted-foreground">Not configured yet.</p>
    );
  }
  return (
    <pre className="max-h-80 overflow-auto rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function ToolDetailPage({
  params,
}: {
  params: Promise<{ toolId: string }>;
}) {
  const { toolId } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);

  const [tool, setTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Inline editors for the tool's configuration (owner only).
  const [editingApi, setEditingApi] = useState(false);
  const [apiDraft, setApiDraft] = useState<Partial<NonNullable<Tool["apiSpec"]>>>({});
  const [editingSchema, setEditingSchema] = useState(false);
  const [schemaDraft, setSchemaDraft] = useState<any>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const loadTool = useCallback(async () => {
    try {
      const res = await fetch(`/api/tools/${toolId}`, { cache: "no-store" });
      const json = await res.json();
      setTool(res.ok ? (json.data ?? json) : null);
    } catch {
      setTool(null);
    } finally {
      setLoading(false);
    }
  }, [toolId]);

  useEffect(() => {
    setLoading(true);
    loadTool();
  }, [loadTool]);

  const toolOwner = ((tool as any)?.owner ?? tool?.ownerId ?? "")
    .toString()
    .toLowerCase();
  const isOwner = Boolean(
    userAddress && toolOwner && toolOwner === userAddress.toLowerCase(),
  );

  const handleSave = async (updates: Partial<Tool>) => {
    const res = await fetch(`/api/tools/${toolId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update tool");
    await loadTool();
  };

  const saveConfig = async (updates: Partial<Tool>) => {
    setSavingConfig(true);
    try {
      await handleSave(updates);
      setEditingApi(false);
      setEditingSchema(false);
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message || "Could not update tool.",
        variant: "destructive",
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/tools/${toolId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete tool");
      router.push("/studio/tools");
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error.message || "Could not delete tool.",
        variant: "destructive",
      });
      setDeleteOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        Tool not found.
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/studio/tools")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tools
        </Button>
      </div>
    );
  }

  const VisibilityIcon = visibilityIcon[tool.visibility] ?? Lock;
  const displayName = tool.displayName || tool.name;
  const apiSpec = tool.apiSpec;

  return (
    <div className="flex h-full min-w-0 flex-col bg-stone-50">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => router.push("/studio/tools")}
            aria-label="Back to tools"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
              <PlugZap className="h-[18px] w-[18px] text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight">
                {displayName}
              </h1>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {tool.name}
              </p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-xs capitalize">
            <VisibilityIcon className="h-3 w-3" />
            {tool.visibility}
          </Badge>
          {isOwner && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setKeysOpen(true)}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Keys
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setPermissionsOpen(true)}
              >
                <Users className="h-3.5 w-3.5" />
                Permissions
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 sm:px-6">
        <div className="mx-auto grid max-w-5xl gap-8 pt-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-8">
            <Section title="Overview">
              <p className="text-sm leading-6 text-muted-foreground">
                {tool.description || "No description provided."}
              </p>
              {tool.tags && tool.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tool.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </Section>

            <Section
              title="API configuration"
              action={
                isOwner && !editingApi ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => {
                      setApiDraft(apiSpec ?? { method: "GET" });
                      setEditingApi(true);
                    }}
                  >
                    {apiSpec?.baseUrl ? "Edit" : "Configure"}
                  </Button>
                ) : undefined
              }
            >
              {editingApi ? (
                <div className="space-y-4">
                  <ApiSpecBuilder value={apiDraft} onChange={setApiDraft} />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingApi(false)}
                      disabled={savingConfig}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        saveConfig({ apiSpec: apiDraft as Tool["apiSpec"] })
                      }
                      disabled={savingConfig || !apiDraft.baseUrl}
                    >
                      {savingConfig ? "Saving…" : "Save API config"}
                    </Button>
                  </div>
                </div>
              ) : apiSpec?.baseUrl ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline" className="font-mono text-xs">
                      {apiSpec.method || "GET"}
                    </Badge>
                    <code className="break-all rounded-md bg-muted/40 px-2 py-1 font-mono text-xs">
                      {apiSpec.baseUrl}
                      {apiSpec.path || ""}
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Auth:{" "}
                    <span className="capitalize">
                      {apiSpec.authType || "none"}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No API endpoint configured yet.
                  {isOwner && " Configure one so agents can call this tool."}
                </p>
              )}
            </Section>

            <Section
              title="Schema"
              action={
                isOwner && !editingSchema ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => {
                      setSchemaDraft(tool.schema || tool.inputSchema || null);
                      setEditingSchema(true);
                    }}
                  >
                    Edit
                  </Button>
                ) : undefined
              }
            >
              {editingSchema ? (
                <div className="space-y-4">
                  <JsonSchemaEditor
                    value={schemaDraft}
                    onChange={setSchemaDraft}
                    label=""
                    placeholder='{"type":"function","function":{...}}'
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingSchema(false)}
                      disabled={savingConfig}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveConfig({ schema: schemaDraft })}
                      disabled={savingConfig || !schemaDraft}
                    >
                      {savingConfig ? "Saving…" : "Save schema"}
                    </Button>
                  </div>
                </div>
              ) : (
                <JsonBlock value={tool.schema || tool.inputSchema} />
              )}
            </Section>

            {tool.outputSchema && (
              <Section title="Output schema">
                <JsonBlock value={tool.outputSchema} />
              </Section>
            )}
          </div>

          <aside className="space-y-8">
            <Section title="Details">
              <dl className="space-y-2.5 text-sm">
                {[
                  ["Category", tool.category || "Uncategorized"],
                  ["Version", tool.version || "1.0.0"],
                  ["Executions", String(tool.executionCount ?? 0)],
                  [
                    "Rate limit",
                    tool.rateLimitPerMinute
                      ? `${tool.rateLimitPerMinute}/min`
                      : "Default",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-3"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="truncate text-right">{value}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section title="Identifier">
              <p className="break-all rounded-lg bg-muted/40 p-2.5 font-mono text-xs text-muted-foreground">
                {tool.toolId}
              </p>
            </Section>

            {isOwner && (
              <Section title="Danger zone">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete tool
                </Button>
              </Section>
            )}
          </aside>
        </div>
      </div>

      <EditToolDialog
        tool={editOpen ? tool : null}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
      />
      <ManageKeysDialog
        tool={keysOpen ? tool : null}
        ownerId={userAddress}
        open={keysOpen}
        onClose={() => setKeysOpen(false)}
      />
      <ManagePermissionsDialog
        tool={permissionsOpen ? tool : null}
        currentUserId={userAddress}
        open={permissionsOpen}
        onClose={() => setPermissionsOpen(false)}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tool?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{displayName}&rdquo; will be permanently removed. Agents
              using it will lose access. This can&rsquo;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
