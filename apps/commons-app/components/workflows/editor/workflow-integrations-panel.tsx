"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Activity, AlertTriangle, CheckCircle2, Copy, Database, KeyRound, Link2, Loader2, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";

type WorkflowIntegrationsPanelProps = {
  workflowId: string;
};

type WebhookConfig = {
  workflowId: string;
  enabled: boolean;
  createdAt?: string;
  lastInvokedAt?: string;
  webhookUrl?: string;
};

type ToolKeyRecord = {
  keyId: string;
  keyName: string;
  displayName?: string | null;
  description?: string | null;
  maskedValue?: string | null;
  keyType?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type DatabaseProvider = "supabase" | "mongodb";

function formatTime(value?: string) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isDatabaseKey(key: ToolKeyRecord) {
  return key.keyName.startsWith("SUPABASE_") ||
    key.keyName.startsWith("MONGODB_") ||
    key.keyName.startsWith("DATABASE_");
}

export function WorkflowIntegrationsPanel({ workflowId }: WorkflowIntegrationsPanelProps) {
  const [webhook, setWebhook] = useState<WebhookConfig | null>(null);
  const [generatedWebhookUrl, setGeneratedWebhookUrl] = useState("");
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<ToolKeyRecord[]>([]);
  const [provider, setProvider] = useState<DatabaseProvider>("supabase");
  const [displayName, setDisplayName] = useState("");
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [mongoUri, setMongoUri] = useState("");

  const databaseKeys = useMemo(() => keys.filter(isDatabaseKey), [keys]);
  const publicApiBase = (process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL || process.env.NEXT_PUBLIC_NEST_API_BASE_URL || "https://api.agentcommons.io").replace(/\/$/, "");
  const executeEndpoint = `${publicApiBase}/v1/workflows/${workflowId}/execute`;
  const apiExample = `curl -X POST '${executeEndpoint}' \\\n+  -H 'Authorization: Bearer <API_KEY>' \\\n+  -H 'Content-Type: application/json' \\\n+  -d '{"inputData": {}}'`;

  const loadWebhook = async () => {
    setWebhookLoading(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/webhook`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load webhook settings");
      setWebhook(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWebhookLoading(false);
    }
  };

  const loadKeys = async () => {
    setKeysLoading(true);
    try {
      const res = await fetch("/api/tool-keys", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load credentials");
      setKeys(Array.isArray(data.data) ? data.data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setKeysLoading(false);
    }
  };

  useEffect(() => {
    loadWebhook().catch(() => undefined);
    loadKeys().catch(() => undefined);
  }, [workflowId]);

  const rotateWebhook = async () => {
    setWebhookLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/webhook`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to generate webhook");
      setWebhook(data);
      setGeneratedWebhookUrl(data.webhookUrl || "");
      setMessage("Webhook URL generated.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWebhookLoading(false);
    }
  };

  const disableWebhook = async () => {
    setWebhookLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/webhook`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to disable webhook");
      setWebhook(data);
      setGeneratedWebhookUrl("");
      setMessage("Webhook disabled.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWebhookLoading(false);
    }
  };

  const saveDatabaseCredential = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingKey(true);
    setError(null);
    setMessage(null);

    try {
      const name = displayName.trim() || (provider === "supabase" ? "Supabase connection" : "MongoDB connection");
      const body = provider === "supabase"
        ? {
            keyName: "SUPABASE_CONNECTION",
            displayName: name,
            description: "workflow:database:supabase",
            keyType: "secret",
            value: JSON.stringify({ url: supabaseUrl.trim(), key: supabaseKey.trim() }),
          }
        : {
            keyName: "MONGODB_CONNECTION_URI",
            displayName: name,
            description: "workflow:database:mongodb",
            keyType: "secret",
            value: mongoUri.trim(),
          };

      const res = await fetch("/api/tool-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save credential");

      setDisplayName("");
      setSupabaseUrl("");
      setSupabaseKey("");
      setMongoUri("");
      setMessage("Credential encrypted and saved.");
      await loadKeys();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingKey(false);
    }
  };

  const deleteKey = async (keyId: string) => {
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/tool-keys/${keyId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Unable to delete credential");
      return;
    }
    setMessage("Credential deleted.");
    await loadKeys();
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4 text-xs">
        {(error || message) && (
          <Alert variant={error ? "destructive" : "default"} className="py-3">
            {error ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            <AlertTitle className="text-xs">{error ? "Integration Error" : "Integration Updated"}</AlertTitle>
            <AlertDescription className="text-xs">{error || message}</AlertDescription>
          </Alert>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <h4 className="font-semibold">Webhook Trigger</h4>
                <p className="truncate text-[11px] text-muted-foreground">POST payloads can start this workflow.</p>
              </div>
            </div>
            <Badge variant={webhook?.enabled ? "default" : "outline"} className="text-[10px]">
              {webhook?.enabled ? "Enabled" : "Manual"}
            </Badge>
          </div>

          <div className="grid grid-cols-[92px_1fr] gap-y-2 text-[11px]">
            <span className="text-muted-foreground">Created</span>
            <span>{formatTime(webhook?.createdAt)}</span>
            <span className="text-muted-foreground">Last event</span>
            <span>{formatTime(webhook?.lastInvokedAt)}</span>
          </div>

          {generatedWebhookUrl && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <Label className="text-[11px]">Webhook URL</Label>
              <div className="flex gap-2">
                <Input value={generatedWebhookUrl} readOnly className="h-8 font-mono text-[11px]" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => navigator.clipboard?.writeText(generatedWebhookUrl)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-8" onClick={rotateWebhook} disabled={webhookLoading}>
              {webhookLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
              {webhook?.enabled ? "Rotate" : "Generate"}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={disableWebhook} disabled={webhookLoading || !webhook?.enabled}>
              <Trash2 className="h-3.5 w-3.5" />
              Disable
            </Button>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <Activity className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <h4 className="font-semibold">Workflow API</h4>
                <p className="text-[11px] text-muted-foreground">Trigger, poll, stream, cancel, or approve a run from an authenticated system.</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">Bearer auth</Badge>
          </div>
          <div className="relative rounded-lg border border-border bg-muted/30 p-3 pr-10">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed">{apiExample}</pre>
            <Button type="button" variant="ghost" size="icon" className="absolute right-1.5 top-1.5 h-7 w-7" onClick={() => navigator.clipboard?.writeText(apiExample)} aria-label="Copy API example">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-1 rounded-lg border border-dashed border-border p-3 font-mono text-[10px] text-muted-foreground">
            <p>GET /executions/:executionId · poll status</p>
            <p>GET /executions/:executionId/stream · SSE updates</p>
            <p>POST /executions/:executionId/cancel · cancel</p>
            <p>POST /executions/:executionId/approve · human approval</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">Keys are scoped to their owner and rate-limited.</p>
            <Link href="/settings/api-keys" className="shrink-0 text-[10px] font-medium underline-offset-2 hover:underline">Manage API keys</Link>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <div>
              <h4 className="font-semibold">Database Credentials</h4>
              <p className="text-[11px] text-muted-foreground">Supabase and MongoDB secrets are encrypted at rest.</p>
            </div>
          </div>

          <form className="space-y-3" onSubmit={saveDatabaseCredential}>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px]">Provider</Label>
                <Select value={provider} onValueChange={(value) => setProvider(value as DatabaseProvider)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supabase">Supabase</SelectItem>
                    <SelectItem value="mongodb">MongoDB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Name</Label>
                <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="h-8 text-xs" placeholder="Analytics DB" />
              </div>
            </div>

            {provider === "supabase" ? (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Project URL</Label>
                  <Input value={supabaseUrl} onChange={(event) => setSupabaseUrl(event.target.value)} className="h-8 text-xs" placeholder="https://project.supabase.co" required />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Service role key</Label>
                  <Textarea value={supabaseKey} onChange={(event) => setSupabaseKey(event.target.value)} className="min-h-20 text-xs" required />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-[11px]">Connection URI</Label>
                <Textarea value={mongoUri} onChange={(event) => setMongoUri(event.target.value)} className="min-h-20 font-mono text-xs" placeholder="mongodb+srv://..." required />
              </div>
            )}

            <Button type="submit" size="sm" className="h-8" disabled={savingKey}>
              {savingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              Save Credential
            </Button>
          </form>

          <div className="space-y-2">
            {keysLoading ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading credentials
              </div>
            ) : databaseKeys.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
                No database credentials connected.
              </div>
            ) : (
              databaseKeys.map((key) => (
                <div key={key.keyId} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{key.displayName || key.keyName}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">{key.keyName} · {key.maskedValue || "masked"}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteKey(key.keyId)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
