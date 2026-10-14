"use client";

import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { SettingsPanel } from "@/components/account/settings-panel";

export default function ApiKeysPage() {
  const { authState } = useAuth();
  const principalId = normalizePrincipalId(authState.walletAddress);

  return (
    <div className="h-app overflow-hidden bg-page">
      <div className="flex h-app flex-col md:flex-row">
        <DashboardSideBar username={principalId} />
        <div className="min-h-0 min-w-0 flex-1">
          <SettingsPanel
            walletAddress={principalId}
            workspaceId={authState.workspaceId}
            initialSection="api-keys"
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}
