"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PanelLeft, PanelRight, Sparkles, Earth, Folder } from "lucide-react";
import { DashboardBar } from "./dashboard-bar";
import { useSidebar } from "@/context/SidebarContext";

export function DashboardSideBar({ username }: { username: string }) {
  const { isOpen, setIsOpen } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();

  const activeSection = useMemo(() => {
    if (!pathname) return "studio";
    if (pathname.startsWith("/studio")) return "studio";
    if (pathname.startsWith("/spaces")) return "spaces";
    if (pathname.startsWith("/files")) return "files";
    return "studio";
  }, [pathname]);

  return (
    <div
      className={cn(
        "h-[calc(100vh-50px)] bg-background border-r border-border flex flex-col transition-all duration-300",
        isOpen ? "w-[260px] min-w-[260px]" : "w-[60px] min-w-[60px]"
      )}
    >
      <div className="px-3 pt-4">
        {isOpen ? (
          <div>
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
