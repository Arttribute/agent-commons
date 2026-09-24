// components/layout/DashboardBar.tsx
"use client";

import { FC, ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { SearchTrigger } from "@/components/search/search-trigger";
import { SidebarMoreMenu } from "./sidebar-more-menu";
import { WorkspaceNavigation } from "./workspace-navigation";

interface DashboardBarProps {
  // values: studio section keys plus the global dashboard sections
  activeTab: string;
  rightSlot?: ReactNode;
}

export const DashboardBar: FC<DashboardBarProps> = ({
  activeTab,
  rightSlot,
}) => {
  const router = useRouter();

  return (
    <WorkspaceNavigation
      activeTab={activeTab}
      navigate={(path) => router.push(path)}
      brand={<Link href="/studio/agents" className="flex items-center" aria-label="Agent Commons">
          <Image
            src="/logo.jpg"
            alt="Agent Commons"
            width={131}
            height={60}
            priority
            className="h-8 w-auto rounded-md object-contain"
          />
        </Link>}
      rightSlot={rightSlot}
      search={<SearchTrigger />}
      more={<SidebarMoreMenu activeSection={activeTab} />}
    />
  );
};
