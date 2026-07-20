"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

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

/**
 * Self-contained plan picker: loads the catalog + current subscription and
 * sends the user straight into Stripe checkout on upgrade. Used by the /plans
 * page and by the upgrade dialog that paywalled features open inline.
 */
export function PlansGrid({
  dense = false,
  showTopups = false,
}: {
  dense?: boolean;
  showTopups?: boolean;
}) {
  const { status: sessionStatus } = useSession();
  const signedIn = sessionStatus === "authenticated";
  const [sub, setSub] = useState<Subscription | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    // The catalog is public; the subscription is not. A signed-out visitor gets
    // a 401 on the latter and still sees pricing, so only the catalog decides
    // whether this component can render at all.
    const [subRes, catalogRes] = await Promise.allSettled([
      fetch("/api/billing/subscription", { cache: "no-store" }),
      fetch("/api/billing/catalog", { cache: "no-store" }),
    ]);
    if (subRes.status === "fulfilled" && subRes.value.ok) {
      const json = await subRes.value.json().catch(() => ({}));
      setSub(json?.data ?? null);
    } else {
      setSub(null);
    }
    if (catalogRes.status === "fulfilled" && catalogRes.value.ok) {
      const json = await catalogRes.value.json().catch(() => ({}));
      const data = json?.data ?? null;
      if (data?.plans?.length) {
        setCatalog(data);
        setStatus("ready");
        return;
      }
    }
    setStatus("error");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkout = useCallback(
    async (kind: "sub" | "topup", key: string) => {
      const tag = `${kind}-${key}`;
      setBusy(tag);
      try {
        const res = await fetch(
          kind === "sub"
            ? "/api/billing/checkout/subscription"
            : "/api/billing/checkout/topup",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              kind === "sub" ? { planKey: key } : { packKey: key },
            ),
          },
        );
        const json = await res.json().catch(() => ({}));
        if (json?.data?.url) {
          window.location.href = json.data.url as string;
          return;
        }
        // A session can lapse between page load and click. Send the user
        // through sign-in and resume the same purchase on the way back.
        if (res.status === 401) {
          const resume = `/plans?checkout=${kind}:${key}`;
          window.location.href = `/login?callbackUrl=${encodeURIComponent(resume)}`;
          return;
        }
        setBusy(null);
      } catch {
        setBusy(null);
      }
    },
    [],
  );

  /**
   * Begin a purchase. Signed-out visitors are sent to sign-in with a callback
   * that reopens /plans and picks the purchase back up automatically.
   */
  function startCheckout(kind: "sub" | "topup", key: string) {
    if (!signedIn) {
      setBusy(`${kind}-${key}`);
      const resume = `/plans?checkout=${kind}:${key}`;
      window.location.href = `/login?callbackUrl=${encodeURIComponent(resume)}`;
      return;
    }
    void checkout(kind, key);
  }

  // Resume a purchase the visitor started before signing in. Reading the query
  // off `location` rather than useSearchParams keeps this component usable
  // outside a Suspense boundary (it also renders inside the upgrade dialog).
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !signedIn) return;
    const params = new URLSearchParams(window.location.search);
    const intent = params.get("checkout");
    if (!intent) return;
    const [kind, key] = intent.split(":");
    if ((kind !== "sub" && kind !== "topup") || !key) return;
    resumed.current = true;
    // Drop the param first so a declined checkout does not loop on reload.
    params.delete("checkout");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
    void checkout(kind, key);
  }, [signedIn, checkout]);

  const currentPlan = sub?.planKey ?? "free";

  if (status === "loading") {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "error" || !catalog) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          Plans could not be loaded right now.
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div
        className={cn(
          "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4",
          dense && "gap-3",
        )}
      >
        {(catalog.plans ?? []).map((plan) => {
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
                dense && "p-4",
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
                <span className="text-3xl font-semibold">${plan.priceUsd}</span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {plan.monthlyCredits
                  ? `${plan.monthlyCredits.toLocaleString()} credits / mo`
                  : "Earn credits as you use the platform"}
              </div>

              <ul className={cn("mt-5 flex-1 space-y-2", dense && "mt-4")}>
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className={cn("mt-6", dense && "mt-4")}>
                {plan.key === "free" || isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    {isCurrent ? "Current plan" : "Free"}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={copy.highlight ? "default" : "outline"}
                    disabled={busy !== null}
                    onClick={() => startCheckout("sub", plan.key)}
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

      {showTopups && (
        <div className="mt-14">
          <div className="text-center">
            <h2 className="text-lg font-medium">Need more credits?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Buy a one-time top-up on any plan.
            </p>
          </div>
          <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
            {(catalog.topups ?? []).map((t) => (
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
                  onClick={() => startCheckout("topup", t.key)}
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
      )}
    </div>
  );
}
