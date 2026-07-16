"use client";

import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { BillingPanel } from "@/components/billing/billing-panel";

export default function BillingPage() {
  const { authState } = useAuth();
  const walletAddress = normalizePrincipalId(authState.walletAddress);

  return (
    <div className="h-screen overflow-hidden bg-stone-50">
      <div className="flex h-screen">
        <DashboardSideBar username={walletAddress} />
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-10">
          <BillingPanel />
        </div>
      </div>
    </div>
  );
}
