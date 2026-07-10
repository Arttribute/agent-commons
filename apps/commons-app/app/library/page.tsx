"use client";

import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { PageHeader } from "@/components/layout/page-header";
import { LibraryBig } from "lucide-react";

export default function LibraryPage() {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);

  return (
    <div className="h-screen overflow-hidden bg-background">
      <div className="flex h-screen">
        <DashboardSideBar username={userAddress} />

        <div className="flex-1 min-w-0 overflow-y-auto">
          <PageHeader
            title="Library"
            description="Files, documents, and collections connected to your account."
          />

          <div className="px-6 py-4">
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
              <LibraryBig className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Your library is coming soon
              </p>
              <p className="max-w-sm text-xs text-muted-foreground/60">
                Connected storage providers and a file browser for everything
                your agents create and use will live here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
