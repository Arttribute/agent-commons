"use client";
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink } from "lucide-react";
import { formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { walletNetwork } from "@/lib/wallet-networks";

/** Networks where agents may send on their own (mirrors the API policy). */
const TRANSFER_NETWORKS = ["84532", "5042002", "11142220"];
const EXPIRY_OPTIONS = [
  { label: "1 day", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

interface Allowance {
  id: string;
  chain_id: string;
  recipients: string[];
  max_transfer_units: string;
  budget_units: string;
  spent_units: string;
  expires_at: string;
  revoked_at: string | null;
}

interface AgentTransfer {
  id: string;
  chain_id: string;
  to_address: string;
  amount_units: string;
  state: "reserved" | "confirmed" | "failed" | "unknown";
  tx_hash: string | null;
  error: string | null;
  created_at: string;
}

const usdc = (units: string) => formatUnits(BigInt(units), 6);
const short = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.message ?? data?.error?.message ?? data?.error ?? "Request failed",
    );
  return (data?.data ?? data) as T;
}

/**
 * Owner-set budget that lets the agent send USDC on its own, including from
 * scheduled tasks, heartbeats and agent-to-agent runs.
 */
export function AgentTransferAllowance({
  agentId,
  walletId,
  defaultChainId,
}: {
  agentId: string;
  walletId: string;
  defaultChainId?: string;
}) {
  const base = `/api/wallets/agent/${encodeURIComponent(agentId)}`;
  const [allowances, setAllowances] = useState<Allowance[]>([]);
  const [transfers, setTransfers] = useState<AgentTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chainId, setChainId] = useState(
    defaultChainId && TRANSFER_NETWORKS.includes(defaultChainId)
      ? defaultChainId
      : "84532",
  );
  const [budget, setBudget] = useState("");
  const [maxPerTransfer, setMaxPerTransfer] = useState("");
  const [recipients, setRecipients] = useState("");
  const [expiryDays, setExpiryDays] = useState(7);

  const load = useCallback(async () => {
    try {
      const [allowanceList, transferList] = await Promise.all([
        fetch(`${base}/transfer-allowances`, { cache: "no-store" }).then((r) =>
          readJson<Allowance[]>(r),
        ),
        fetch(`${base}/transfers`, { cache: "no-store" }).then((r) =>
          readJson<AgentTransfer[]>(r),
        ),
      ]);
      setAllowances(Array.isArray(allowanceList) ? allowanceList : []);
      setTransfers(Array.isArray(transferList) ? transferList : []);
    } catch (e: any) {
      setError(e.message ?? "Could not load transfer allowances");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await readJson(
        await fetch(`${base}/transfer-allowances`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletId,
            chainId,
            budget: budget.trim(),
            maxPerTransfer: (maxPerTransfer || budget).trim(),
            recipients: recipients
              .split(/[\s,]+/)
              .map((r) => r.trim())
              .filter(Boolean),
            expiresAt: new Date(
              Date.now() + expiryDays * 86_400_000,
            ).toISOString(),
          }),
        }),
      );
      setBudget("");
      setMaxPerTransfer("");
      setRecipients("");
      await load();
    } catch (e: any) {
      setError(e.message ?? "Could not set the allowance");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    try {
      await readJson(
        await fetch(`${base}/transfer-allowances/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
      );
      await load();
    } catch (e: any) {
      setError(e.message ?? "Could not revoke the allowance");
    }
  };

  const active = allowances.filter(
    (a) => !a.revoked_at && new Date(a.expires_at).getTime() > Date.now(),
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Let this agent send USDC on its own, up to a budget you set. Applies to
        chats, scheduled tasks and payments to other agents. Testnets only.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active allowance. The agent cannot send funds.
        </p>
      ) : (
        <ul className="divide-y divide-border/70 rounded-lg border border-border">
          {active.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {usdc(
                    (BigInt(a.budget_units) - BigInt(a.spent_units)).toString(),
                  )}{" "}
                  of {usdc(a.budget_units)} USDC left
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {walletNetwork(a.chain_id)?.name ?? a.chain_id} · up to{" "}
                  {usdc(a.max_transfer_units)} per transfer ·{" "}
                  {a.recipients.length
                    ? `${a.recipients.length} recipient${a.recipients.length === 1 ? "" : "s"}`
                    : "any recipient"}{" "}
                  · expires{" "}
                  {formatDistanceToNow(new Date(a.expires_at), {
                    addSuffix: true,
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => revoke(a.id)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted-foreground">
          Network
          <select
            aria-label="Allowance network"
            className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
            value={chainId}
            onChange={(e) => setChainId(e.target.value)}
          >
            {TRANSFER_NETWORKS.map((id) => (
              <option key={id} value={id}>
                {walletNetwork(id)?.name ?? id}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          Expires after
          <select
            aria-label="Allowance expiry"
            className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          Total budget (USDC)
          <Input
            className="mt-1"
            inputMode="decimal"
            placeholder="10"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Max per transfer (USDC)
          <Input
            className="mt-1"
            inputMode="decimal"
            placeholder="Same as budget"
            value={maxPerTransfer}
            onChange={(e) => setMaxPerTransfer(e.target.value)}
          />
        </label>
        <label className="block text-xs text-muted-foreground sm:col-span-2">
          Allowed recipients (optional, one address per line)
          <Textarea
            className="mt-1 font-mono text-xs"
            rows={2}
            placeholder="Leave empty to allow any recipient"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {error ?? "The wallet also needs a little native balance for gas."}
        </p>
        <Button size="sm" onClick={create} disabled={saving || !budget.trim()}>
          {saving ? "Saving…" : "Set allowance"}
        </Button>
      </div>

      {transfers.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Transfers sent by the agent
          </p>
          <ul className="divide-y divide-border/70">
            {transfers.slice(0, 10).map((t) => {
              const network = walletNetwork(t.chain_id);
              return (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {usdc(t.amount_units)} USDC to {short(t.to_address)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.state} · {network?.name ?? t.chain_id} ·{" "}
                      {formatDistanceToNow(new Date(t.created_at), {
                        addSuffix: true,
                      })}
                      {t.state === "failed" && t.error ? ` · ${t.error}` : ""}
                    </p>
                  </div>
                  {network && t.tx_hash && (
                    <a
                      href={`${network.explorer}/tx/${t.tx_hash}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`View transfer on ${network.name}`}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
