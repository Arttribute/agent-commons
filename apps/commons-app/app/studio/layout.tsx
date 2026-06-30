"use client";

import AppBar from "@/components/layout/app-bar";
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
    <div className="min-h-screen bg-background">
      <AppBar />
      <div className="mt-12 flex">
        <DashboardSideBar username={userAddress} />
        <main className="h-[calc(100vh-50px)] min-w-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
