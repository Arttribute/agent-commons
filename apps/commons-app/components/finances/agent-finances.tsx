"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { AddToAgentBalance } from "@/components/finances/add-to-agent-balance";
import { Wallet, RefreshCw } from "lucide-react";
import { useAgentWallet } from "@/hooks/use-wallet";

interface AgentFinancesProps {
  agentId: string;
}

export default function AgentFinances({ agentId }: AgentFinancesProps) {
  const { wallet, balance, loading, balanceLoading, refetchBalance } = useAgentWallet(agentId);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="cursor-pointer border border-border rounded-lg p-2 hover:border-foreground/50 transition-colors">
          <div className="flex items-center gap-1">
            <Wallet className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Wallet</h3>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-1">
            <div className="col-span-1 border border-border py-1 px-2 rounded-lg">
              <p className="text-xl font-semibold">
                {balanceLoading || loading ? "…" : (balance?.usdc ?? "0")}
              </p>
              <p className="text-xs">USDC</p>
            </div>
            <div className="col-span-1 border border-border py-1 px-2 rounded-lg">
              <p className="text-xl font-semibold">
                {balanceLoading || loading ? "…" : (balance?.native ?? "0").slice(0, 6)}
              </p>
              <p className="text-xs">ETH</p>
            </div>
          </div>
        </div>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <div className="p-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Agent Wallet</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={refetchBalance}
              disabled={balanceLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${balanceLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Balance Cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>USDC Balance</CardDescription>
                <CardTitle className="text-3xl">
                  {balanceLoading ? "…" : (balance?.usdc ?? "0")}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>ETH Balance</CardDescription>
                <CardTitle className="text-3xl">
                  {balanceLoading ? "…" : (balance?.native ?? "0").slice(0, 8)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Fund section */}
          <div className="border rounded-lg p-3">
            <p className="text-sm font-medium mb-3">Fund Wallet</p>
            <AddToAgentBalance agentId={agentId} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
