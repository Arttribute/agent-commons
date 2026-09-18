"use client";

import { useCallback, useEffect, useState } from "react";

export type CreditsSummary = {
  balance: { balance: number; reserved: number; available: number };
  month: { earned: number; spent: number };
};

export type SubscriptionSummary = {
  planKey: string;
  planName: string;
};

/**
 * Credit balance and plan for the signed-in user. Refreshes on window focus
 * and on the `credits-updated` event. Full detail lives on /settings/billing.
 */
export function useCredits(enabled = true) {
  const [summary, setSummary] = useState<CreditsSummary | null>(null);
  const [plan, setPlan] = useState<SubscriptionSummary | null>(null);

  const refresh = useCallback(async () => {
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
    if (!enabled) return;
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("credits-updated", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("credits-updated", refresh);
    };
  }, [enabled, refresh]);

  return { summary, plan, refresh };
}
