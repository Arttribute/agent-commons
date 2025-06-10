"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PanelLeft, BookOpen, PlusCircle, Sparkles, Earth } from "lucide-react";
import { AgentTitleCard } from "@/components/agents/agent-title-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import SessionsList from "@/components/sessions/sessions-list";

function NavItem({
  icon: Icon,
  label,
  isOpen,
}: {
  icon: any;
  label: string;
  isOpen: boolean;
}) {
  return (
    <li>
      <Link
        href="#"
        className="flex items-center gap-3 text-muted-foreground hover:text-foreground py-2 px-2 rounded-md hover:bg-accent transition-colors"
      >
        <Icon className="h-5 w-5" />
        {isOpen && <span className="text-sm">{label}</span>}
      </Link>
    </li>
  );
}

export function SessionsSideBar({
  username,
  sessions,
}: {
  username: string;
  sessions: any;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [recentChats, setRecentChats] = useState<any[]>([]);

  useEffect(() => {
    async function fetchRecentChats() {
      try {
        const res = await fetch(`/api/users/user?username=${username}`);
        if (!res.ok) {
          throw new Error("Failed to fetch user data");
        }
        const data = await res.json();
        // data.sessionsByLastInteraction is already sorted newest -> oldest
        setRecentChats(data.sessionsByLastInteraction || []);
      } catch (error) {
        console.error(error);
      }
    }

    fetchRecentChats();
  }, [username]);

  return (
    <div
      className={cn(
        "h-screen bg-background border-r border-border border-gray-400 flex flex-col transition-all duration-300",
        isOpen ? "w-[260px] min-w-[260px]" : "w-[60px] min-w-[60px]"
      )}
    >
      <div className="px-3 pt-4 flex items-center">
        {isOpen ? (
          <div className="flex items-center justify-between w-full">
            <AgentTitleCard />

            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground ml-auto"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="px-2">
            <button
              onClick={() => setIsOpen(true)}
              className=" items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <div className="px-3 py-2 mt-1">
        <Link href={`/worlds/create`}>
          <Button className="w-full flex items-center justify-center gap-2 rounded-md py-2 font-medium text-sm">
            {isOpen ? <>New Session</> : <PlusCircle className="h-5 w-5" />}
          </Button>
        </Link>
      </div>

      <nav className="mt-2 px-3">
        <ul className="space-y-1">
          <li>
            <Link
              href="/worlds"
              className="flex items-center gap-3 text-muted-foreground hover:text-foreground py-2 px-2 rounded-md hover:bg-accent transition-colors"
            >
              <Earth className="h-5 w-5" />
              {isOpen && <span className="text-sm">Explore agents</span>}
            </Link>
          </li>
        </ul>
      </nav>

      {isOpen && (
        <div className="mt-6 flex-1 overflow-y-auto">
          <div className="px-3">
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              Recent Sessions
            </h3>
            <ul className="space-y-1">
              <ScrollArea className="h-[60vh] -mr-2">
                <SessionsList sessions={sessions} />
              </ScrollArea>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
