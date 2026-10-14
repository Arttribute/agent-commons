"use client";

import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { SettingsPanel } from "@/components/account/settings-panel";

export default function SettingsPage() {
  const { authState } = useAuth();
  const walletAddress = normalizePrincipalId(authState.walletAddress);

  return (
    <div className="h-app overflow-hidden bg-page">
      <div className="flex h-app flex-col md:flex-row">
        <DashboardSideBar username={walletAddress} />
        <div className="min-h-0 flex-1 min-w-0">
          <SettingsPanel
            walletAddress={walletAddress}
            workspaceId={authState.workspaceId}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}
