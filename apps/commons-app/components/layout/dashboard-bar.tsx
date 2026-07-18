// components/layout/DashboardBar.tsx
"use client";

import { FC, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  BriefcaseBusiness,
  LibraryBig,
  Wrench,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { SearchTrigger } from "@/components/search/search-trigger";
import { SidebarMoreMenu } from "./sidebar-more-menu";

interface DashboardBarProps {
  // values: studio section keys plus the global dashboard sections
  activeTab: string;
  rightSlot?: ReactNode;
}

export const DashboardBar: FC<DashboardBarProps> = ({ activeTab, rightSlot }) => {
  const router = useRouter();

  const nav = (path: string) => router.push(path);

  const navItems = [
    { key: "agents",    label: "Agents",    icon: Bot,               path: "/studio/agents" },
    { key: "tools",     label: "Tools",     icon: Wrench,            path: "/studio/tools" },
    { key: "tasks",     label: "Tasks",     icon: BriefcaseBusiness, path: "/studio/tasks" },
    { key: "workflows", label: "Workflows", icon: Workflow,          path: "/studio/workflows" },
    { key: "library",   label: "Library",   icon: LibraryBig,        path: "/library" },
  ];

  return (
    <div className="w-full">
      <div className="flex h-8 justify-between items-center mb-3 px-1">
        <Link href="/studio/agents" className="flex items-center" aria-label="Agent Commons">
          <Image
            src="/logo.jpg"
            alt="Agent Commons"
            width={131}
            height={60}
            priority
            className="h-8 w-auto rounded-md object-contain"
          />
        </Link>
        <div className="flex items-center">{rightSlot}</div>
      </div>
      <div className="flex flex-col gap-1">
        <SearchTrigger />
        {navItems.map(({ key, label, icon: Icon, path }) => (
          <button
            key={key}
            type="button"
            className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-normal transition-colors ${
              activeTab === key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={() => nav(path)}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </button>
        ))}
        <SidebarMoreMenu activeSection={activeTab} />
      </div>
    </div>
  );
};
