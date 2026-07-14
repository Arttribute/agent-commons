"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

type PlanKey = "free" | "plus" | "pro" | "max";

interface Subscription {
  planKey: PlanKey;
  planName: string;
  monthlyCredits: number;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface CreditsData {
  balance: { balance: number } | null;
  ledger: Array<{
    entryId: string;
    amount: number;
    eventType: string;
    description?: string | null;
    createdAt: string;
  }>;
}

const PLANS: Array<{
  key: PlanKey;
  name: string;
  price: string;
  credits: string;
  features: string[];
}> = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    credits: "500 credits / mo",
    features: ["Native agents", "Basic chat", "No computer use"],
  },
  {
    key: "plus",
    name: "Plus",
    price: "$20",
    credits: "5,000 credits / mo",
    features: ["Everything in Free", "Computer use (standard)", "Frontier models"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$50",
    credits: "14,000 credits / mo",
    features: ["Performance computers", "Higher concurrency", "Priority support"],
  },
  {
    key: "max",
    name: "Max",
    price: "$200",
    credits: "60,000 credits / mo",
    features: ["GPU computers", "Highest limits"],
  },
];

const TOPUPS = [
  { key: "small", label: "$10", credits: "10,000" },
  { key: "medium", label: "$50", credits: "52,500" },
  { key: "large", label: "$100", credits: "110,000" },
];

export function BillingPanel() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, credRes] = await Promise.all([
        fetch("/api/billing/subscription", { cache: "no-store" }),
        fetch("/api/credits", { cache: "no-store" }),
      ]);
      const subJson = await subRes.json().catch(() => ({}));
      const credJson = await credRes.json().catch(() => ({}));
      setSub(subJson?.data ?? null);
      setCredits(credJson ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function redirectTo(path: string, body: unknown, tag: string) {
    setBusy(tag);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.data?.url) {
        window.location.href = json.data.url as string;
      } else {
        console.error("Checkout failed", json);
        setBusy(null);
      }
    } catch (e) {
      console.error(e);
      setBusy(null);
    }
  }

  const currentPlan = sub?.planKey ?? "free";
  const balance = credits?.balance?.balance ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Billing &amp; credits</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Credits cover model usage and agent computer time.
          </p>
        </div>
        <Image
          src="/logo.jpg"
          alt="Agent Commons"
          width={110}
          height={28}
          className="shrink-0"
        />
      </div>

      {/* Balance */}
      <Card className="mt-6 flex items-center justify-between p-5">
        <div>
          <div className="text-sm text-muted-foreground">Credit balance</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {loading ? "—" : balance.toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {TOPUPS.map((t) => (
            <Button
              key={t.key}
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                redirectTo("/api/billing/checkout/topup", { packKey: t.key }, `topup-${t.key}`)
              }
              title={`${t.credits} credits`}
            >
              {busy === `topup-${t.key}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Add ${t.label}`
              )}
            </Button>
          ))}
        </div>
      </Card>

      {/* Plans */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.key === currentPlan;
          return (
            <Card
              key={plan.key}
              className={cn(
                "flex flex-col p-5",
                isCurrent && "ring-2 ring-indigo-400",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{plan.name}</span>
                {isCurrent && <Badge variant="secondary">Current</Badge>}
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {plan.price}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{plan.credits}</div>
              <ul className="mt-4 flex-1 space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {plan.key === "free" ? (
                  <Button variant="outline" size="sm" disabled className="w-full">
                    {isCurrent ? "Current plan" : "Free"}
                  </Button>
                ) : isCurrent ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={busy !== null}
                    onClick={() => redirectTo("/api/billing/portal", {}, "portal")}
                  >
                    {busy === "portal" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Manage"
                    )}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={busy !== null}
                    onClick={() =>
                      redirectTo(
                        "/api/billing/checkout/subscription",
                        { planKey: plan.key },
                        `sub-${plan.key}`,
                      )
                    }
                  >
                    {busy === `sub-${plan.key}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Upgrade"
                    )}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {sub && sub.cancelAtPeriodEnd && (
        <p className="mt-4 text-sm text-amber-600">
          Your plan is set to cancel at the end of the current period.
        </p>
      )}

      {/* Recent activity */}
      <div className="mt-10">
        <h2 className="text-sm font-medium">Recent credit activity</h2>
        <Card className="mt-3 divide-y">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : credits?.ledger?.length ? (
            credits.ledger.map((e) => (
              <div
                key={e.entryId}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate">{e.description || e.eventType}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </div>
                </div>
                <div
                  className={cn(
                    "tabular-nums",
                    e.amount >= 0 ? "text-emerald-600" : "text-muted-foreground",
                  )}
                >
                  {e.amount >= 0 ? "+" : ""}
                  {e.amount.toLocaleString()}
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-sm text-muted-foreground">No activity yet.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
