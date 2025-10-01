"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PanelLeft, BookOpen, PlusCircle, Sparkles, Earth } from "lucide-react";
import { AgentTitleCard } from "@/components/agents/agent-title-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardBar } from "./DashboardBar";
import SessionsList from "../sessions/sessions-list";
import { useAuth } from "@/context/AuthContext";

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

export function DashboardSideBar({ username }: { username: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const { authState } = useAuth();
  const { walletAddress } = authState;

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
      <div className="px-3 pt-4 flex items-center">
        {isOpen ? (
          <div>
            <div className="flex items-center justify-between w-full">
              <DashboardBar activeTab="agents" />
            </div>
            <SessionsList sessions={recentChats} />
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
    </div>
  );
}
