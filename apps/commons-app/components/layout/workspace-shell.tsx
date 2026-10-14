"use client";

import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAuth } from "@/context/AuthContext";
import { useDailyBonus } from "@/hooks/use-daily-bonus";
import { normalizePrincipalId } from "@/lib/principal-id";

/** The signed-in app frame: main sidebar beside a content area that owns its scrolling. */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  // Showing up counts: first visit each day claims the daily bonus.
  useDailyBonus(userAddress || undefined);

  return (
    <div className="h-app overflow-hidden bg-page">
      <div className="flex h-app flex-col md:flex-row">
        <DashboardSideBar username={userAddress} />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
