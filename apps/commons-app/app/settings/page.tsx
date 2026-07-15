"use client";

import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { SettingsPanel } from "@/components/account/settings-panel";

export default function SettingsPage() {
  const { authState } = useAuth();
  const walletAddress = normalizePrincipalId(authState.walletAddress);

  return (
    <div className="h-screen overflow-hidden bg-stone-50">
      <div className="flex h-screen">
        <DashboardSideBar username={walletAddress} />
        <div className="flex-1 min-w-0">
          <SettingsPanel walletAddress={walletAddress} className="h-screen" />
        </div>
      </div>
    </div>
  );
}
