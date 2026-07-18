"use client";

import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const TOAST_LINES = [
  "☀️ Daily boost!",
  "🎉 Good to see you!",
  "✨ You showed up — that counts.",
  "🚀 Back at it!",
];

/**
 * Claims the daily check-in reward automatically the first time the user
 * lands on a studio page each day, and celebrates with a small toast.
 * The backend is idempotent per day; localStorage just avoids re-posting
 * on every navigation.
 */
export function useDailyBonus(principalId: string | undefined) {
  const { toast } = useToast();

  useEffect(() => {
    if (!principalId || typeof window === "undefined") return;
    const today = new Date().toISOString().slice(0, 10);
    const key = `ac-daily-bonus:${principalId}:${today}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "pending");

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/credits/daily", { method: "POST" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          window.localStorage.removeItem(key);
          return;
        }
        window.localStorage.setItem(key, "done");
        if (cancelled || payload?.data?.alreadyClaimed) return;
        const credits = Number(payload?.data?.claim?.credits ?? 0);
        const line =
          TOAST_LINES[
            (new Date().getDate() + principalId.length) % TOAST_LINES.length
          ];
        toast({
          title: line,
          description: credits
            ? `+${credits.toLocaleString()} credits for showing up today.`
            : "Daily bonus added for showing up today.",
        });
      } catch {
        window.localStorage.removeItem(key);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [principalId, toast]);
}
