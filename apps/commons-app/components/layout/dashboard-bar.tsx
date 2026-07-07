// components/layout/DashboardBar.tsx
import { FC, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  BriefcaseBusiness,
  Earth,
  Folder,
  ScrollText,
  Wrench,
  Workflow,
  Zap,
  BarChart2,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

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
    { key: "skills",    label: "Skills",    icon: Zap,               path: "/studio/skills" },
    { key: "logs",      label: "Logs",      icon: ScrollText,        path: "/logs" },
    { key: "usage",     label: "Usage",     icon: BarChart2,         path: "/usage" },
    { key: "spaces",    label: "Spaces",    icon: Earth,             path: "/spaces" },
    { key: "files",     label: "Files",     icon: Folder,            path: "/files" },
  ];

  return (
    <div className="w-full">
      <div className="flex h-7 justify-between items-center mb-3 px-1">
        <Link href="/studio/agents" className="flex items-center" aria-label="Agent Commons">
          <Image
            src="/logo.jpg"
            alt="Agent Commons"
            width={112}
            height={28}
            priority
            className="h-5 w-auto rounded-[4px] object-contain"
          />
        </Link>
        <div className="flex items-center">{rightSlot}</div>
      </div>
      <div className="flex flex-col gap-1">
        {navItems.map(({ key, label, icon: Icon, path }) => (
          <Button
            key={key}
            variant="ghost"
            className={`justify-start px-2 w-full ${
              activeTab === key ? "bg-accent text-accent-foreground" : ""
            }`}
            onClick={() => nav(path)}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
};
