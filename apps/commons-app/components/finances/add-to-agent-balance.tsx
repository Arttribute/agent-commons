"use client";
import { useState } from "react";
import { Copy, CheckCheck, ExternalLink, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAgentWallet } from "@/hooks/use-wallet";

interface AddToAgentBalanceProps {
  agentId: string;
  onFundSuccess?: () => void;
}

/**
 * Shows the agent's primary wallet address so the user can send USDC to it.
 * Phase 10: Replaced CommonToken funding with USDC wallet display.
 */
export function AddToAgentBalance({ agentId, onFundSuccess }: AddToAgentBalanceProps) {
  const { wallet, balance, loading, balanceLoading, createWallet } = useAgentWallet(agentId);
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onFundSuccess?.();
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading wallet…</p>;
  }

  if (!wallet) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">No wallet provisioned yet.</p>
        <Button size="sm" onClick={createWallet}>Create Wallet</Button>
      </div>
    );
  }

  const shortAddr = `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;

  return (
    <div className="space-y-3">
      {/* Balance row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="font-mono text-xs">
          {balanceLoading ? "…" : `${balance?.usdc ?? "0"} USDC`}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {balanceLoading ? "" : `${balance?.native ?? "0"} ETH`}
        </span>
      </div>

      {/* Address row */}
      <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
        <Wallet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-mono text-xs text-foreground flex-1 truncate">{wallet.address}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => copy(wallet.address)}
        >
          {copied ? <CheckCheck className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Send USDC to this address on{" "}
        <span className="font-medium">Base Sepolia</span> to fund the agent.
      </p>

      <a
        href={`https://sepolia.basescan.org/address/${wallet.address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        View on BaseScan <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
