"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PanelLeft, PanelRight, Sparkles, Earth, Folder } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardBar } from "./DashboardBar";
import SessionsList from "../sessions/sessions-list";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";

export function DashboardSideBar({ username }: { username: string }) {
  const { isOpen, setIsOpen } = useSidebar();
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const pathname = usePathname();
  const router = useRouter();

  // Persistence is handled in SidebarProvider

  const activeSection = useMemo(() => {
    if (!pathname) return "studio";
    if (pathname.startsWith("/studio")) return "studio";
    if (pathname.startsWith("/spaces")) return "spaces";
    if (pathname.startsWith("/files")) return "files";
    return "studio";
  }, [pathname]);

  const userAddress = walletAddress?.toLowerCase();
  useEffect(() => {
    const fetchSessions = async () => {
      if (!username) return;
      const res = await fetch(
        `/api/sessions/list?agentId=${"0x385e15a9d5e94c3df8090dc024473b6002f03c03"}&initiatorId=${userAddress}`
      );
      const data = await res.json();
      setRecentChats(data.data || []);
    };

    fetchSessions();
  }, [username]);

  return (
    <div
      className={cn(
        "h-screen bg-background border-r border-border border-gray-400 flex flex-col transition-all duration-300",
        isOpen ? "w-[260px] min-w-[260px]" : "w-[60px] min-w-[60px]"
      )}
    >
      <div className="px-3 pt-4">
        {isOpen ? (
          <div>
            <div className="flex items-center justify-between w-full">
              <DashboardBar
                activeTab={activeSection}
                rightSlot={
                  <button
                    aria-label="Collapse sidebar"
                    className="ml-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setIsOpen(false)}
                  >
                    <PanelRight className="h-5 w-5" />
                  </button>
                }
              />
            </div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              Recent sessions
            </h3>
            <ScrollArea className="h-[calc(80vh-200px)] px-1">
              <SessionsList sessions={recentChats} />
            </ScrollArea>
          </div>
        ) : (
          <div className="px-2 flex flex-col gap-4 items-center">
            <button
              onClick={() => setIsOpen(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Expand sidebar"
              title="Open sidebar"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center gap-3 mt-2">
              <button
                className={cn(
                  "rounded-md p-1 hover:bg-accent text-muted-foreground hover:text-foreground",
                  activeSection === "studio" &&
                    "bg-accent text-accent-foreground"
                )}
                aria-label="Studio"
                title="Studio"
                onClick={() => router.push("/studio/agents")}
              >
                <Sparkles className="h-5 w-5" />
              </button>
              <button
                className={cn(
                  "rounded-md p-1 hover:bg-accent text-muted-foreground hover:text-foreground",
                  activeSection === "spaces" &&
                    "bg-accent text-accent-foreground"
                )}
                aria-label="Spaces"
                title="Spaces"
                onClick={() => router.push("/spaces")}
              >
                <Earth className="h-5 w-5" />
              </button>
              <button
                className={cn(
                  "rounded-md p-1 hover:bg-accent text-muted-foreground hover:text-foreground",
                  activeSection === "files" &&
                    "bg-accent text-accent-foreground"
                )}
                aria-label="Files"
                title="Files"
                onClick={() => router.push("/files")}
              >
                <Folder className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
