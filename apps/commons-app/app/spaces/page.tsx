"use client";

import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { useSpaces } from "@/hooks/spaces/use-spaces";
// Create form moved to its own page
import { SpacesList } from "@/components/spaces/spaces-list";
import { CreateButton, PageTitle } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

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
        const res = await fetch(
          `/api/agents?ownerId=${encodeURIComponent(humanId)}`,
        );
        const json = await res.json();
        if (!cancelled) {
          const list = json.data || [];
          setAgentIds(
            Array.isArray(list)
              ? list.map((a: any) => a.agentId).filter(Boolean)
              : [],
          );
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
    <div className="h-screen overflow-hidden">
      <div className="h-screen">
        <div className="flex h-screen bg-background">
          <DashboardSideBar username={humanId || "wallet"} />
          <div className="w-full p-4 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between px-4 pt-4">
              <div>
                <PageTitle title="Spaces" />
                <p className="text-sm text-muted-foreground mt-1.5">
                  Spaces you are in (you + {ownedAgentCount} agents).
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 max-w-xs">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search spaces..."
                  />
                </div>
                <CreateButton
                  label="Create new space"
                  onClick={() => {
                    window.open("/spaces/create", "_self");
                  }}
                />
              </div>
            </div>

            <ScrollArea className="space-y-4 p-4 h-[72vh]">
              {loading && (
                <div className="text-xs text-muted-foreground">
                  Loading spaces...
                </div>
              )}
              {error && <div className="text-xs text-red-500">{error}</div>}
              <SpacesList
                spaces={spaces}
                emptyMessage={loading ? "" : "No spaces yet"}
              />
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
