// components/layout/DashboardBar.tsx
import { FC, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Earth, Folder, MessageSquare, Wallet, ScrollText, BarChart2 } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

interface DashboardBarProps {
  // values: 'studio' | 'spaces' | 'files' | 'sessions' | 'wallets'
  activeTab: string;
  rightSlot?: ReactNode;
}

export const DashboardBar: FC<DashboardBarProps> = ({ activeTab, rightSlot }) => {
  const router = useRouter();

  const nav = (path: string) => router.push(path);

  const navItems = [
    { key: "studio",   label: "Studio",   icon: Sparkles,      path: "/studio/agents" },
    { key: "sessions", label: "Sessions", icon: MessageSquare, path: "/sessions" },
    { key: "wallets",  label: "Wallets",  icon: Wallet,        path: "/wallets" },
    { key: "logs",     label: "Logs",     icon: ScrollText,    path: "/logs" },
    { key: "usage",    label: "Usage",    icon: BarChart2,     path: "/usage" },
    { key: "spaces",   label: "Spaces",   icon: Earth,         path: "/spaces" },
    { key: "files",    label: "Files",    icon: Folder,        path: "/files" },
  ];

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2 px-1">
        <div className="rounded-full border border-border p-[1px] bg-background">
          <div className="rounded-full border">
            <Image
              src="/ac-icon.svg"
              alt="Agent Commons Logo"
              width={20}
              height={20}
              className="object-cover rounded-full"
            />
          </div>
        </div>
        <div>{rightSlot}</div>
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
