// components/layout/DashboardBar.tsx
"use client";

import { CommonsLogo } from "@/components/layout/commons-logo";

import { FC, ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NewChatButton } from "./new-chat-button";
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
      brand={<Link href="/new" className="flex items-center" aria-label="Agent Commons">
          <CommonsLogo priority className="h-8 w-auto rounded-md object-contain" />
        </Link>}
      rightSlot={rightSlot}
      lead={<NewChatButton active={activeTab === "new"} />}
      more={<SidebarMoreMenu activeSection={activeTab} />}
    />
  );
};
