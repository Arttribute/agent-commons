"use client";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  RefreshCw,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WALLET_NETWORKS, walletNetwork } from "@/lib/wallet-networks";

interface WalletActivityItem {
  hash: string;
  chainId: string;
  kind: "token" | "native" | "call";
  direction: "in" | "out" | "self";
  asset: string;
  amount: string;
  from: string;
  to: string | null;
  timestamp: string | null;
  status: "success" | "failed" | "pending";
  method: string | null;
}

type WalletRef = {
  id: string;
  address: string;
  chainId: string;
  provider?: string | null;
};

const REFRESH_MS = 30_000;

function short(address?: string | null) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "contract";
}

/** Live on-chain activity for an agent wallet across its funding networks. */
export function AgentTransactions({ wallet }: { wallet: WalletRef }) {
  const [items, setItems] = useState<WalletActivityItem[] | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [unindexed, setUnindexed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [version, refresh] = useState(0);
  const generation = useRef(0);
  const networks = WALLET_NETWORKS.filter((n) =>
    wallet.provider === "custom"
      ? n.chainId === wallet.chainId
      : n.testnet || n.chainId === wallet.chainId,
  );

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setLoading(true);
    Promise.all(
      networks.map(async (network) => {
        try {
          const response = await fetch(
            `/api/wallets/${encodeURIComponent(wallet.id)}/transactions?chainId=${network.chainId}`,
            { cache: "no-store", signal: controller.signal },
          );
          if (!response.ok) throw new Error("Activity unavailable");
          const data = await response.json();
          const activity = data?.data ?? data;
          if (
            activity?.chainId !== network.chainId ||
            activity?.address?.toLowerCase() !== wallet.address.toLowerCase() ||
            !Array.isArray(activity.items)
          )
            throw new Error("Activity did not match this wallet");
          return {
            network,
            supported: activity.supported !== false,
            items: activity.items as WalletActivityItem[],
          };
        } catch {
          return { network, supported: true, items: null };
        }
      }),
    ).then((results) => {
      if (generation.current !== current || controller.signal.aborted) return;
      setItems(
        results
          .flatMap((r) => r.items ?? [])
          .sort(
            (a, b) =>
              (b.timestamp ? Date.parse(b.timestamp) : Number.MAX_SAFE_INTEGER) -
              (a.timestamp ? Date.parse(a.timestamp) : Number.MAX_SAFE_INTEGER),
          ),
      );
      setUnavailable(
        results.filter((r) => r.items === null).map((r) => r.network.name),
      );
      setUnindexed(
        results.filter((r) => !r.supported).map((r) => r.network.name),
      );
      setLoading(false);
    });
    const timer = setInterval(() => refresh((v) => v + 1), REFRESH_MS);
    return () => {
      generation.current++;
      controller.abort();
      clearInterval(timer);
    };
  }, [wallet.id, wallet.address, wallet.chainId, wallet.provider, version]);

  return (
    <section className="space-y-3" aria-label="Wallet activity">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          On-chain activity across networks
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={loading}
          onClick={() => refresh((v) => v + 1)}
        >
          <RefreshCw
            className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading activity…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No transactions yet. Funds sent to this wallet appear here once they
          are confirmed on chain.
        </p>
      ) : (
        <ul className="divide-y divide-border/70">
          {items.map((item) => {
            const network = walletNetwork(item.chainId);
            const incoming = item.direction === "in";
            const Icon =
              item.direction === "self"
                ? Repeat
                : incoming
                  ? ArrowDownLeft
                  : ArrowUpRight;
            const label =
              item.kind === "call"
                ? (item.method ?? "Contract call")
                : incoming
                  ? "Received"
                  : item.direction === "self"
                    ? "Self transfer"
                    : "Sent";
            return (
              <li
                key={`${item.chainId}:${item.hash}:${item.kind}`}
                className="flex items-center gap-3 py-2.5"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {label}
                    {item.status !== "success" && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.status}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {network?.name ?? item.chainId} ·{" "}
                    {incoming
                      ? `from ${short(item.from)}`
                      : `to ${short(item.to)}`}
                    {item.timestamp
                      ? ` · ${formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}`
                      : ""}
                  </p>
                </div>
                {item.kind !== "call" && (
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {incoming ? "+" : item.direction === "out" ? "−" : ""}
                    {item.amount} {item.asset}
                  </span>
                )}
                {network && (
                  <a
                    href={`${network.explorer}/tx/${item.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View transaction on ${network.name}`}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(unavailable.length > 0 || unindexed.length > 0) && (
        <p className="text-xs text-muted-foreground">
          {unavailable.length > 0 &&
            `Activity could not be loaded for ${unavailable.join(", ")}. `}
          {unindexed.length > 0 &&
            `History for ${unindexed.join(", ")} is on its explorer.`}
        </p>
      )}
    </section>
  );
}
