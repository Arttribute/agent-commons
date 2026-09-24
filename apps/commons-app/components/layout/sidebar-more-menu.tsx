"use client";

import { useRouter } from "next/navigation";
import { Logs, Earth, Code2 } from "lucide-react";
import { WorkspaceMoreMenu } from "./workspace-navigation";

const MORE_ITEMS = [
  { key: "logs", label: "Logs", icon: Logs, path: "/logs" },
  { key: "spaces", label: "Spaces", icon: Earth, path: "/spaces" },
  { key: "developers", label: "Developers", icon: Code2, path: "/developers" },
];

/**
 * Overflow menu for secondary sidebar destinations (Logs, Spaces). Flies out
 * to the right of the trigger, matching the dashboard's other nav items in
 * both the expanded list and the collapsed icon rail.
 */
export function SidebarMoreMenu({
  collapsed = false,
  activeSection,
}: {
  collapsed?: boolean;
  activeSection?: string;
}) {
  const router = useRouter();
  return <WorkspaceMoreMenu items={MORE_ITEMS} activeSection={activeSection} navigate={(path) => router.push(path)} collapsed={collapsed} />;
}
