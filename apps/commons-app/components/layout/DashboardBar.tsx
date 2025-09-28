// components/layout/DashboardBar.tsx
import { FC } from "react";
import { useRouter } from "next/navigation";
import { Bot, CreditCard, BadgePlus, Wrench, User } from "lucide-react";
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
    <div className="w-full ">
      <div className="flex justify-between items-center mb-2">
        <div className="bg-cyan-200 rounded-lg w-20">
          <h2 className="text-xl font-semibold">Commons Studio</h2>
        </div>
        {isAuthenticated && activeTab === "tools" && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 border border-gray-800 font-semibold"
            onClick={() => router.push("/tools/create")}
          >
            <BadgePlus />
            <p className="text-sm -ml-1">Create Tool</p>
          </Button>
        )}
        {isAuthenticated && activeTab === "agents" && (
          <Button
            size="sm"
            className="h-8 border border-gray-800 font-semibold"
            variant="outline"
            onClick={() => router.push("/agents/create")}
          >
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
      <div>
        <Command className="rounded-lg ">
          <CommandList>
            <CommandGroup heading="Creations">
              <CommandItem
                onSelect={() => handleNavigation("agents")}
                className={
                  activeTab === "agents"
                    ? "bg-accent text-accent-foreground"
                    : ""
                }
              >
                <Bot />
                <span>Agents</span>
              </CommandItem>
              <CommandItem
                onSelect={() => handleNavigation("tools")}
                className={
                  activeTab === "tools"
                    ? "bg-accent text-accent-foreground"
                    : ""
                }
              >
                <Wrench />
                <span>Tools</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Your Profile">
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
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  );
};
