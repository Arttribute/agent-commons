"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  WALLET_NETWORKS,
  parseWalletBalance,
  type NetworkBalance,
} from "@/lib/wallet-networks";

export function NetworkBalances({
  wallet,
}: {
  wallet: { id: string; address: string; chainId: string; provider?: string };
}) {
  const [balances, setBalances] = useState<
    Record<string, NetworkBalance | null>
  >({});
  const [loading, setLoading] = useState(false);
  const [version, refresh] = useState(0);
  const generation = useRef(0);
  const networks = WALLET_NETWORKS.filter((n) =>
    wallet.provider === "custom"
      ? n.chainId === wallet.chainId
      : n.testnet || n.chainId === wallet.chainId,
  );
  useEffect(() => {
    const current = ++generation.current,
      controller = new AbortController();
    setBalances({});
    setLoading(true);
    Promise.allSettled(
      networks.map(async (network) => {
        try {
          const response = await fetch(
            `/api/wallets/${encodeURIComponent(wallet.id)}/balance?chainId=${network.chainId}`,
            { cache: "no-store", signal: controller.signal },
          );
          if (!response.ok) throw new Error("Balance unavailable");
          const balance = parseWalletBalance(
            await response.json(),
            network.chainId,
          );
          if (balance.address.toLowerCase() !== wallet.address.toLowerCase())
            throw new Error("Wallet mismatch");
          if (generation.current === current)
            setBalances((b) => ({ ...b, [network.chainId]: balance }));
        } catch {
          if (generation.current === current && !controller.signal.aborted)
            setBalances((b) => ({ ...b, [network.chainId]: null }));
        }
      }),
    ).then(() => {
      if (generation.current === current) setLoading(false);
    });
    return () => {
      generation.current++;
      controller.abort();
    };
  }, [wallet.id, wallet.address, wallet.chainId, wallet.provider, version]);
  return (
    <section className="mt-3 space-y-3" aria-label="Network balances">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Balances by network · test funds
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={loading}
          onClick={() => refresh((v) => v + 1)}
        >
          <RefreshCw
            className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {networks.map((network) => {
          const balance = balances[network.chainId];
          return (
            <div
              key={network.chainId}
              className="rounded-md border border-border px-3 py-2 min-w-0"
            >
              <div className="flex justify-between gap-2 text-xs">
                <span>
                  {network.name}
                  {!network.testnet ? " · real funds" : ""}
                </span>
                <a
                  href={`${network.explorer}/${network.chainId === "296" ? "account" : "address"}/${wallet.address}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View wallet on ${network.name}`}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="mt-1 text-sm font-medium break-all" role="status">
                {balance
                  ? `${balance.usdc} USDC`
                  : balance === null
                    ? "Balance unavailable"
                    : "Loading…"}
              </div>
              {balance && (
                <p className="mt-1 text-xs text-muted-foreground break-all">
                  {balance.native} {network.symbol}{" "}
                  {network.chainId === "5042002"
                    ? "native balance · also used for gas"
                    : "for network fees"}
                </p>
              )}
              {network.chainId === "296" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  USDC receipt requires token association.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Balances are separate on each network. Funds in game escrow are shown in
        Arcade’s payment receipts.
      </p>
    </section>
  );
}
