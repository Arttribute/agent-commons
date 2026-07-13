"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

type PlanKey = "free" | "plus" | "pro" | "max";

interface Subscription {
  planKey: PlanKey;
  planName: string;
}

const PLANS: Array<{
  key: PlanKey;
  name: string;
  price: string;
  credits: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}> = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    credits: "500 credits / mo",
    tagline: "Explore native agents",
    features: ["Native agents", "Basic chat", "Fast & standard models", "No computer use"],
  },
  {
    key: "plus",
    name: "Plus",
    price: "$20",
    credits: "5,000 credits / mo",
    tagline: "For everyday builders",
    features: [
      "Everything in Free",
      "Agent computer use (standard)",
      "Frontier models",
      "Higher concurrency",
    ],
    highlight: true,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$50",
    credits: "14,000 credits / mo",
    tagline: "For power users",
    features: [
      "Everything in Plus",
      "Performance computers",
      "More concurrent agents",
      "Priority support",
    ],
  },
  {
    key: "max",
    name: "Max",
    price: "$200",
    credits: "60,000 credits / mo",
    tagline: "For teams at scale",
    features: [
      "Everything in Pro",
      "GPU computers",
      "Highest limits",
    ],
  },
];

const TOPUPS = [
  { key: "small", label: "$10", credits: "10,000 credits" },
  { key: "medium", label: "$50", credits: "52,500 credits" },
  { key: "large", label: "$100", credits: "110,000 credits" },
];

export default function PlansPage() {
  const router = useRouter();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/subscription", { cache: "no-store" });
      setSub((await res.json().catch(() => ({})))?.data ?? null);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkout(path: string, body: unknown, tag: string) {
    setBusy(tag);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.data?.url) window.location.href = json.data.url as string;
      else setBusy(null);
    } catch {
      setBusy(null);
    }
  }

  function goBack() {
    // Return to wherever the user came from; fall back to home.
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  const currentPlan = sub?.planKey ?? "free";

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal top bar with back button */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3">
        <button
          onClick={goBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-20">
        <div className="text-center">
          <h1 className="text-2xl font-semibold sm:text-3xl">Choose your plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Credits cover model usage and agent computer time. Upgrade or
            downgrade anytime.
          </p>
        </div>

        {/* Plans */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.key === currentPlan;
            return (
              <div
                key={plan.key}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6",
                  plan.highlight && "border-indigo-300 shadow-sm",
                  isCurrent && "ring-2 ring-indigo-400",
                )}
              >
                {plan.highlight && !isCurrent && (
                  <span className="absolute -top-2.5 left-6 rounded-full bg-indigo-500 px-2.5 py-0.5 text-[11px] font-medium text-white">
                    Popular
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-lg font-medium">{plan.name}</span>
                  {isCurrent && <Badge variant="secondary">Current</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{plan.credits}</div>

                <ul className="mt-5 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {plan.key === "free" || isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      {isCurrent ? "Current plan" : "Free"}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={plan.highlight ? "default" : "outline"}
                      disabled={busy !== null}
                      onClick={() =>
                        checkout(
                          "/api/billing/checkout/subscription",
                          { planKey: plan.key },
                          `sub-${plan.key}`,
                        )
                      }
                    >
                      {busy === `sub-${plan.key}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        `Upgrade to ${plan.name}`
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* One-time top-ups */}
        <div className="mt-14">
          <div className="text-center">
            <h2 className="text-lg font-medium">Need more credits?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Buy a one-time top-up on any plan.
            </p>
          </div>
          <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
            {TOPUPS.map((t) => (
              <div
                key={t.key}
                className="flex flex-col items-center rounded-xl border p-5 text-center"
              >
                <div className="text-2xl font-semibold">{t.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.credits}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                  disabled={busy !== null}
                  onClick={() =>
                    checkout("/api/billing/checkout/topup", { packKey: t.key }, `topup-${t.key}`)
                  }
                >
                  {busy === `topup-${t.key}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Buy"
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
