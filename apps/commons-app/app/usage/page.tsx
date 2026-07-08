"use client";

import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { UsageSection } from "@/components/account/usage-section";

export default function UsagePage() {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);

  return (
    <div className="h-screen overflow-hidden bg-background">
      <div className="flex h-screen">
        <DashboardSideBar username={userAddress} />
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-6 py-8">
            <UsageSection walletAddress={userAddress} />
          </div>
        </div>
      </div>
    </div>
  );
}
