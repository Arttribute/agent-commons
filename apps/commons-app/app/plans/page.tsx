"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
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

interface CatalogPlan {
  key: PlanKey;
  name: string;
  priceUsd: number;
  monthlyCredits: number;
  entitlements: {
    maxComputerAgents: number;
    maxConcurrentComputers: number;
    maxConcurrentRuns: number;
    allowedProfiles: string[];
  };
}

interface Catalog {
  plans: CatalogPlan[];
  topups: Array<{ key: string; credits: number; priceUsd: number }>;
}

const PLAN_COPY: Record<PlanKey, { tagline: string; highlight?: boolean }> = {
  free: { tagline: "Start building and earn credits" },
  plus: { tagline: "For everyday builders", highlight: true },
  pro: { tagline: "For power users" },
  max: { tagline: "For teams and heavier workloads" },
};

export default function PlansPage() {
  const router = useRouter();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [subRes, catalogRes] = await Promise.all([
        fetch("/api/billing/subscription", { cache: "no-store" }),
        fetch("/api/billing/catalog", { cache: "no-store" }),
      ]);
      setSub((await subRes.json().catch(() => ({})))?.data ?? null);
      setCatalog((await catalogRes.json().catch(() => ({})))?.data ?? null);
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
      {/* Minimal top bar: back button left, brand top right */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-background/95 px-4 py-3 backdrop-blur">
        <button
          onClick={goBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Image
          src="/logo.jpg"
          alt="Agent Commons"
          width={131}
          height={60}
          className="mr-2 h-8 w-auto shrink-0 rounded-md object-contain"
        />
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-20">
        <div className="text-center">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            Choose your plan
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every plan includes unlimited agents. Credits cover their work;
            plans set persistent computer slots and parallel usage.
          </p>
        </div>

        {/* Plans */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(catalog?.plans ?? []).map((plan) => {
            const isCurrent = plan.key === currentPlan;
            const copy = PLAN_COPY[plan.key];
            const features = [
              "Unlimited agents",
              plan.monthlyCredits
                ? `${plan.monthlyCredits.toLocaleString()} monthly credits`
                : "Daily and achievement credits",
              plan.entitlements.maxComputerAgents
                ? `${plan.entitlements.maxComputerAgents} persistent computer ${plan.entitlements.maxComputerAgents === 1 ? "slot" : "slots"}`
                : "No persistent computer",
              `${plan.entitlements.maxConcurrentRuns} parallel agent runs`,
            ];
            return (
              <div
                key={plan.key}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6",
                  copy.highlight && "border-indigo-300 shadow-sm",
                  isCurrent && "ring-2 ring-indigo-400",
                )}
              >
                {copy.highlight && !isCurrent && (
                  <span className="absolute -top-2.5 left-6 rounded-full bg-indigo-500 px-2.5 py-0.5 text-[11px] font-medium text-white">
                    Popular
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-lg font-medium">{plan.name}</span>
                  {isCurrent && <Badge variant="secondary">Current</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {copy.tagline}
                </p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold">
                    ${plan.priceUsd}
                  </span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {plan.monthlyCredits
                    ? `${plan.monthlyCredits.toLocaleString()} credits / mo`
                    : "Earn credits as you use the platform"}
                </div>

                <ul className="mt-5 flex-1 space-y-2">
                  {features.map((f) => (
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
                      variant={copy.highlight ? "default" : "outline"}
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
            {(catalog?.topups ?? []).map((t) => (
              <div
                key={t.key}
                className="flex flex-col items-center rounded-xl border p-5 text-center"
              >
                <div className="text-2xl font-semibold">${t.priceUsd}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t.credits.toLocaleString()} credits
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                  disabled={busy !== null}
                  onClick={() =>
                    checkout(
                      "/api/billing/checkout/topup",
                      { packKey: t.key },
                      `topup-${t.key}`,
                    )
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
