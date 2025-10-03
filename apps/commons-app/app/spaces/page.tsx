"use client";

import AppBar from "@/components/layout/app-bar";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";

export default function SpacesPage() {
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const [spaces, setSpaces] = useState<any[]>([]);
  const userAddress = walletAddress?.toLowerCase();

  useEffect(() => {
    // TODO: Replace with real fetch for spaces owned by user or their agents
    setSpaces([]);
  }, [userAddress]);

  return (
    <div>
      <AppBar />
      <div className="mt-12">
        <div className="flex">
          <DashboardSideBar username={"userAddress"} />
          <div className="w-full p-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Spaces</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Spaces you're in and spaces your agents are in.
            </p>
            {spaces.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No spaces yet.
              </div>
            ) : (
              <div>/* Render spaces list here */</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
