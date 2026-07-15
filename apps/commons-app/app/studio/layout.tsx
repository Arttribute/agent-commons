"use client";

import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);

  return (
    <div className="h-screen overflow-hidden bg-stone-50">
      <div className="flex h-screen">
        <DashboardSideBar username={userAddress} />
        <main className="h-screen min-w-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
