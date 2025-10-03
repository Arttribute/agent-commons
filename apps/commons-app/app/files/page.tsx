"use client";

import AppBar from "@/components/layout/app-bar";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";

export default function FilesPage() {
  return (
    <div>
      <AppBar />
      <div className="mt-12">
        <div className="flex">
          <DashboardSideBar username={"userAddress"} />
          <div className="w-full p-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Files</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Coming soon: files and folders connected to your account.
            </p>
            <div className="rounded-md border p-6 text-sm text-muted-foreground">
              Placeholder content. We'll show your connected storage providers
              and file browser here.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
