"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type AnalyticsPayload = {
  eventType: string;
  courseSlug?: string;
  page?: string;
  source?: string;
  referrer?: string;
  provider?: "stripe" | "paystack";
  paymentPlan?: "one_time" | "installment";
  accessCode?: string;
  affiliateCode?: string;
  originalAmount?: number;
  finalAmount?: number;
  discountAmount?: number;
  currency?: string;
  moduleIndex?: number;
  lessonIndex?: number;
  metadata?: Record<string, unknown>;
};

export function AnalyticsTracker({
  courseSlug,
  page,
  eventType = "page_view",
  metadata,
}: {
  courseSlug?: string;
  page: string;
  eventType?: string;
  metadata?: Record<string, unknown>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const source = useMemo(() => readSource(searchParams), [searchParams]);

  useEffect(() => {
    trackAnalytics({
      eventType,
      courseSlug,
      page,
      source,
      referrer: document.referrer || undefined,
      metadata: {
        ...metadata,
        query: Object.fromEntries(searchParams.entries()),
      },
    });
  }, [courseSlug, eventType, metadata, page, searchParams, source, pathname]);

  return null;
}

export function useAnalytics() {
  const searchParams = useSearchParams();
  return useCallback(
    (payload: AnalyticsPayload) => {
      trackAnalytics({
        ...payload,
        source: payload.source || readSource(searchParams),
        referrer:
          typeof document !== "undefined" ? document.referrer || undefined : undefined,
      });
    },
    [searchParams]
  );
}

export function trackAnalytics(payload: AnalyticsPayload) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    ...payload,
    path: window.location.pathname,
    anonymousId: getStoredId("commons_analytics_id", "localStorage"),
    sessionId: getStoredId("commons_analytics_session", "sessionStorage"),
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/analytics/events", blob);
    return;
  }

  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}

function readSource(searchParams: URLSearchParams) {
  return (
    searchParams.get("utm_source") ||
    searchParams.get("source") ||
    searchParams.get("affiliate") ||
    searchParams.get("ref") ||
    undefined
  );
}

function getStoredId(key: string, storageName: "localStorage" | "sessionStorage") {
  const storage = window[storageName];
  const existing = storage.getItem(key);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  storage.setItem(key, next);
  return next;
}
