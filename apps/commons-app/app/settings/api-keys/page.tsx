"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import AppBar from "@/components/layout/app-bar";
interface ApiKey {
  id: string;
  label?: string;
  createdAt: string;
  lastUsedAt?: string;
}
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Trash2, Copy, Check, KeyRound } from "lucide-react";

export default function ApiKeysPage() {
  const { authState } = useAuth();
  const walletAddress = authState.walletAddress?.toLowerCase() ?? "";

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
      const res = await fetch(`/api/api-keys?principalId=${encodeURIComponent(walletAddress)}&principalType=user`);
      const data = await res.json();
      setKeys(Array.isArray(data) ? data : (data.data ?? []));
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleGenerate = async () => {
    if (!walletAddress) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          principalId: walletAddress,
          principalType: "user",
          label: labelInput.trim() || undefined,
        }),
      });
      const result = await res.json();
      setNewKey(result.key ?? result.data?.key);
      setLabelInput("");
      await fetchKeys();
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } finally {
      setRevoking(null);
    }
  };

  const handleCopy = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppBar />
      <div className="max-w-2xl mx-auto px-6 pt-20">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-5 w-5" />
          <h1 className="text-xl font-semibold">API Keys</h1>
        </div>
        <p className="text-muted-foreground text-sm mb-2">
          Use API keys to access Agent Commons programmatically — via the SDK, CLI, or your own apps.
        </p>
        <p className="text-muted-foreground text-xs mb-8 font-mono bg-muted px-3 py-1.5 rounded inline-block">
          agc login  →  paste your key + wallet address
        </p>

        {/* Generate new key */}
        <div className="flex gap-2 mb-8">
          <Input
            placeholder="Label (e.g. my-app, laptop)"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            className="max-w-xs"
          />
          <Button
            onClick={handleGenerate}
            disabled={generating || !walletAddress}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Generate Key"
            )}
          </Button>
        </div>

        {/* Keys list */}
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded-md border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {k.label ?? (
                      <span className="text-muted-foreground italic">Unlabeled</span>
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
                  aria-label="Revoke key"
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
      </div>

      {/* One-time key reveal dialog */}
      <Dialog
        open={!!newKey}
        onOpenChange={(open) => { if (!open) setNewKey(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy this key now — it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm break-all font-mono select-all">
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
          <div className="mt-4 text-xs text-muted-foreground space-y-1">
            <p>To use with the CLI:</p>
            <code className="block bg-muted px-3 py-2 rounded font-mono">
              agc login
            </code>
          </div>
          <Button className="mt-4 w-full" onClick={() => setNewKey(null)}>
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
