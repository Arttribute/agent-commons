"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function SidebarCreditBalance({ collapsed }: { collapsed: boolean }) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/credits", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) {
          setBalance(payload?.data?.balance?.available ?? 0);
        }
      } catch {
        // The billing screen remains the authoritative fallback.
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, []);

  return (
    <Link
      href="/settings/billing"
      aria-label={
        balance === null ? "Credits" : `${balance.toLocaleString()} credits`
      }
      title={
        balance === null ? "Credits" : `${balance.toLocaleString()} credits`
      }
      className={cn(
        "mb-2 flex items-center rounded-lg border bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100",
        collapsed ? "h-9 w-9 justify-center" : "mx-2 gap-2 px-2.5 py-2",
      )}
    >
      <Coins className="h-4 w-4 shrink-0" />
      {!collapsed ? (
        <span className="min-w-0 flex-1 truncate text-xs font-medium tabular-nums">
          {balance === null ? "Credits" : `${balance.toLocaleString()} credits`}
        </span>
      ) : null}
    </Link>
  );
}
