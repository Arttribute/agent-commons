"use client";

import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { ProjectNavigation } from "@/components/projects/project-navigation";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  return (
      <div className="h-screen overflow-hidden bg-page">
        <div className="flex h-screen">
          <DashboardSideBar username={userAddress} />
          <ProjectNavigation />
          <main className="h-screen min-w-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
  );
}
