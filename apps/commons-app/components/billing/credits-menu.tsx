"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Sparkles } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type CreditsSummary = {
  balance: { balance: number; reserved: number; available: number };
  month: { earned: number; spent: number };
};

type SubscriptionSummary = {
  planKey: string;
  planName: string;
};

/**
 * Top-right credits pill: a sparkles icon with the available balance that
 * opens a compact summary menu. Full detail lives on /settings/billing.
 */
export function CreditsMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<CreditsSummary | null>(null);
  const [plan, setPlan] = useState<SubscriptionSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const [creditsRes, subscriptionRes] = await Promise.all([
        fetch("/api/credits", { cache: "no-store" }),
        fetch("/api/billing/subscription", { cache: "no-store" }),
      ]);
      if (creditsRes.ok) {
        const payload = await creditsRes.json().catch(() => ({}));
        if (payload?.data) setSummary(payload.data);
      }
      if (subscriptionRes.ok) {
        const payload = await subscriptionRes.json().catch(() => ({}));
        if (payload?.data) setPlan(payload.data);
      }
    } catch {
      // The billing page remains the authoritative fallback.
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const available = summary?.balance.available;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            available === undefined
              ? "Credits"
              : `${available.toLocaleString()} credits`
          }
          className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm text-foreground shadow-card transition-colors hover:bg-muted"
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.75} />
          <span className="tabular-nums">
            {available === undefined ? "—" : available.toLocaleString()}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 p-0">
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
          <div>
            <p className="text-sm font-medium">{plan?.planName ?? "Free"}</p>
            <p className="text-xs text-muted-foreground">Current plan</p>
          </div>
          {(!plan || plan.planKey === "free") && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/plans");
              }}
              className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-85"
            >
              Upgrade
            </button>
          )}
        </div>
        <div className="mx-4 h-px bg-border" />
        <div className="space-y-2 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Credits
            </span>
            <span className="font-medium tabular-nums">
              {available === undefined ? "—" : available.toLocaleString()}
            </span>
          </div>
          {summary?.balance.reserved ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>In active runs</span>
              <span className="tabular-nums">
                {summary.balance.reserved.toLocaleString()}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Earned this month</span>
            <span className="tabular-nums">
              +{(summary?.month.earned ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Used this month</span>
            <span className="tabular-nums">
              −{(summary?.month.spent ?? 0).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="mx-4 h-px bg-border" />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            router.push("/settings/billing");
          }}
          className="flex w-full items-center justify-between px-4 py-3 text-sm text-foreground transition-colors hover:bg-muted/60"
        >
          <span>View details &amp; get credits</span>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverContent>
    </Popover>
  );
}
