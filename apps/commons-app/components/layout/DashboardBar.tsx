// components/layout/DashboardBar.tsx
import { FC } from "react";
import { useRouter } from "next/navigation";
import { Bot, CreditCard, BadgePlus, Wrench, User } from "lucide-react";
import { CreateTool } from "@/components/tools/CreateTool";
import { useAuth } from "@/context/AuthContext";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

interface DashboardBarProps {
  activeTab: string;
}

export const DashboardBar: FC<DashboardBarProps> = ({ activeTab }) => {
  const router = useRouter();
  const { authState, login, logout } = useAuth();
  const { idToken, username, walletAddress } = authState;
  const isAuthenticated = !!idToken;

  /** Navigate to /studio/[tab] */
  const handleNavigation = (tab: string) => {
    router.push(`/studio/${tab}`);
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <h2 className="font-semibold">Commons Studio</h2>
        {isAuthenticated && activeTab === "tools" && (
          <Button size="sm" onClick={() => router.push("/tools/create")}>
            <BadgePlus />
            <p className="text-sm -ml-1">Create Tool</p>
          </Button>
        )}
        {isAuthenticated && activeTab === "agents" && (
          <Button size="sm" onClick={() => router.push("/agents/create")}>
            <BadgePlus />
            <p className="text-sm -ml-1">Create Agent</p>
          </Button>
        )}
        {!isAuthenticated && (
          <Button size="sm" onClick={login}>
            Login
          </Button>
        )}
      </div>

      <Command className="rounded-lg">
        <CommandList>
          <CommandGroup heading="Creations">
            <CommandItem
              onSelect={() => handleNavigation("agents")}
              className={
                activeTab === "agents" ? "bg-accent text-accent-foreground" : ""
              }
            >
              <Bot />
              <span>Agents</span>
            </CommandItem>
            <CommandItem
              onSelect={() => handleNavigation("tools")}
              className={
                activeTab === "tools" ? "bg-accent text-accent-foreground" : ""
              }
            >
              <Wrench />
              <span>Tools</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Account">
            <CommandItem
              onSelect={() => handleNavigation("profile")}
              className={
                activeTab === "profile"
                  ? "bg-accent text-accent-foreground"
                  : ""
              }
            >
              <User />
              <span>Profile</span>
            </CommandItem>

            <CommandItem
              onSelect={() => handleNavigation("balances")}
              className={
                activeTab === "balances"
                  ? "bg-accent text-accent-foreground"
                  : ""
              }
            >
              <CreditCard />
              <span>Balances</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
};
