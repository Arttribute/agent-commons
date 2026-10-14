"use client";

import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { UsageSection } from "@/components/account/usage-section";

export default function UsagePage() {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);

  return (
    <div className="h-app overflow-hidden bg-page">
      <div className="flex h-app flex-col md:flex-row">
        <DashboardSideBar username={userAddress} />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-6 py-8">
            <UsageSection walletAddress={userAddress} />
          </div>
        </div>
      </div>
    </div>
  );
}
