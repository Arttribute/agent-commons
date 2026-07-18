"use client";

import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAuth } from "@/context/AuthContext";
import { useDailyBonus } from "@/hooks/use-daily-bonus";
import { normalizePrincipalId } from "@/lib/principal-id";

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  // Showing up counts: first studio visit each day claims the daily bonus.
  useDailyBonus(userAddress || undefined);

  return (
    <div className="h-screen overflow-hidden bg-page">
      <div className="flex h-screen">
        <DashboardSideBar username={userAddress} />
        <main className="h-screen min-w-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
