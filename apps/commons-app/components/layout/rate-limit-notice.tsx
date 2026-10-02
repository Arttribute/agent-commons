"use client";

import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";

const NOTICE_COOLDOWN_MS = 20_000;

/**
 * Tells people when Agent Commons rate limits them, so a view that fails to
 * load is explained instead of looking broken. It watches the status of
 * same-origin /api responses and never reads their bodies.
 */
export function RateLimitNotice() {
  useEffect(() => {
    const previous = window.fetch;
    let lastShown = 0;
    const observed = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await previous(input, init);
      if (response.status === 429 && isAppApiRequest(input)) {
        const now = Date.now();
        if (now - lastShown > NOTICE_COOLDOWN_MS) {
          lastShown = now;
          const seconds = Number(response.headers.get("retry-after"));
          toast({
            title: "You've hit a rate limit",
            description:
              Number.isFinite(seconds) && seconds > 0
                ? `Agent Commons is receiving too many requests. Wait ${Math.ceil(seconds)} seconds, then try again.`
                : "Agent Commons is receiving too many requests. Wait a few seconds, then try again.",
          });
        }
      }
      return response;
    }) as typeof fetch;
    window.fetch = observed;
    return () => {
      if (window.fetch === observed) window.fetch = previous;
    };
  }, []);
  return null;
}

function isAppApiRequest(input: RequestInfo | URL) {
  try {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}
