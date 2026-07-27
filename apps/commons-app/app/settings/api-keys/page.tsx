"use client";

import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { SettingsPanel } from "@/components/account/settings-panel";

export default function ApiKeysPage() {
  const { authState } = useAuth();
  const principalId = normalizePrincipalId(authState.walletAddress);

  return (
    <div className="h-screen overflow-hidden bg-page">
      <div className="flex h-screen">
        <DashboardSideBar username={principalId} />
        <div className="min-w-0 flex-1">
          <SettingsPanel
            walletAddress={principalId}
            workspaceId={authState.workspaceId}
            initialSection="api-keys"
            className="h-screen"
          />
        </div>
      </div>
    </div>
  );
}
