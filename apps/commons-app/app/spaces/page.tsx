"use client";

import AppBar from "@/components/layout/app-bar";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { useSpaces } from "@/hooks/spaces/use-spaces";
// Create form moved to its own page
import { SpacesList } from "@/components/spaces/spaces-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SpacesPage() {
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const humanId = walletAddress?.toLowerCase();
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  // Fetch agents owned by the user (simple request once)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!humanId) return;
      try {
        const res = await fetch(`/api/agents?owner=${humanId}`);
        const data = await res.json();
        if (!cancelled) {
          const list = data.data || data;
          const ids = Array.isArray(list)
            ? list.map((a: any) => a.agentId).filter(Boolean)
            : [];
          setAgentIds(ids);
        }
      } catch {}
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [humanId]);

  const { spaces, loading, error, refetch } = useSpaces({
    memberId: humanId,
    agentIds,
    includeMembers: true,
    search,
  });

  // Creation now happens on /spaces/create page. Refresh list when returning if needed via manual reload or future focus effect.

  const ownedAgentCount = agentIds.length;

  return (
    <div>
      <AppBar />
      <div className="mt-12">
        <div className="flex">
          <DashboardSideBar username={humanId || "wallet"} />
          <div className="w-full p-4 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Spaces</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Spaces you're in (you + {ownedAgentCount} agents).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-xs">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search spaces..."
                />
              </div>
              <Button
                size="sm"
                onClick={() => {
                  window.open("/spaces/create", "_self");
                }}
              >
                New Space
              </Button>
            </div>
            <div className="text-[10px] text-gray-400">
              Listing spaces that you or your agents are members of.
            </div>
            <div className="space-y-4">
              {loading && (
                <div className="text-xs text-gray-500">Loading spaces...</div>
              )}
              {error && <div className="text-xs text-red-500">{error}</div>}
              <SpacesList
                spaces={spaces}
                emptyMessage={loading ? "" : "No spaces yet"}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
