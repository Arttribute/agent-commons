"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import RandomPixelAvatar from "@/components/account/random-avatar";
import {
  SettingsPanel,
  type SettingsSection,
} from "@/components/account/settings-panel";
import { useCredits } from "@/hooks/use-credits";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { formatCredits, formatCreditsExact } from "@/lib/format-credits";
import {
  UserRound,
  LogOut,
  LogIn,
  ChevronsUpDown,
  Sparkles,
  CircleArrowUp,
  MonitorDown,
  ShieldCheck,
} from "lucide-react";

const DESKTOP_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL ??
  "/download/desktop";

export function SidebarAccount({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const { authState, login, logout } = useAuth();
  const { mode } = useWorkspaceMode();
  const { idToken, username, walletAddress } = authState;
  const isAuthenticated = !!idToken;
  const principalId = normalizePrincipalId(walletAddress);
  const displayName = username || walletAddress || "Account";

  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("profile");
  const [desktopAvailable, setDesktopAvailable] = useState(false);

  useEffect(() => {
    setDesktopAvailable(Boolean(window.agentCommonsDesktop));
  }, []);

  const { summary, plan, refresh: refreshCredits } = useCredits(isAuthenticated && mode === "cloud");
  const available = summary?.balance.available;
  const isFreePlan = mode === "cloud" && (!plan || plan.planKey === "free");

  useEffect(() => {
    if (menuOpen && mode === "cloud") void refreshCredits();
  }, [menuOpen, mode, refreshCredits]);

  const go = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };
  useEffect(() => {
    if (mode === "cloud" && isAuthenticated && principalId && window.agentCommonsDesktop) {
      void window.agentCommonsDesktop.syncAccount({
        userId: principalId,
        displayName,
        email: authState.email,
      });
    }
  }, [mode, isAuthenticated, principalId, displayName, authState.email]);

  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setMenuOpen(false);
    setSettingsOpen(true);
  };

  if (!isAuthenticated) {
    return (
      <Button
        onClick={login}
        size="sm"
        className={cn("h-9 w-full gap-2", collapsed && "w-9 p-0")}
        aria-label="Log in"
      >
        <LogIn className="h-4 w-4" />
        {!collapsed && "Log in"}
      </Button>
    );
  }

  const menuItems: {
    label: string;
    icon: React.ElementType;
    onClick: () => void;
  }[] = [
    ...(isFreePlan
      ? [{ label: "Upgrade plan", icon: CircleArrowUp, onClick: () => go("/plans") }]
      : []),
    { label: "Account", icon: UserRound, onClick: () => openSettings("profile") },
  ];

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-accent",
              collapsed ? "justify-center p-1.5" : "w-full px-2 py-2",
            )}
            aria-label={
              available === undefined
                ? "Account menu"
                : `Account menu, ${formatCreditsExact(available)} credits`
            }
          >
            <div className="rounded-full overflow-hidden shrink-0 ring-1 ring-border">
              <RandomPixelAvatar username={principalId || displayName} size={28} />
            </div>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm leading-5">
                    {displayName}
                  </span>
                  <span className="block truncate text-xs leading-4 text-muted-foreground tabular-nums">
                    {available === undefined
                      ? mode === "private-local" ? "Local workspace" : "\u00a0"
                      : `${formatCredits(available)} credits`}
                  </span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align={collapsed ? "start" : "center"}
          sideOffset={8}
          className="w-56 p-1"
        >
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {mode === "private-local" ? "Local workspace" : plan ? `${plan.planName} plan` : "Signed in"}
            </p>
          </div>
          <div className="my-1 h-px bg-border" />
          {mode === "cloud" && <button
            onClick={() => go("/settings/billing")}
            title={
              available === undefined
                ? undefined
                : `${formatCreditsExact(available)} credits available`
            }
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Credits
            <span className="ml-auto font-medium tabular-nums">
              {available === undefined ? "—" : formatCredits(available)}
            </span>
          </button>}
          {menuItems.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </button>
          ))}
          {!desktopAvailable && (
            <a
              href={DESKTOP_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <MonitorDown className="h-4 w-4 text-muted-foreground" />
              Download desktop app
            </a>
          )}
          {mode === "cloud" && <div className="my-1 h-px bg-border" />}
          {mode === "cloud" && <button
            onClick={() => {
              setMenuOpen(false);
              logout();
              router.push("/");
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
            Log out
          </button>}
        </PopoverContent>
      </Popover>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="flex h-[600px] max-h-[85vh] w-[95vw] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle>Account</DialogTitle>
          </DialogHeader>
          <SettingsPanel
            key={settingsSection}
            walletAddress={principalId}
            initialSection={settingsSection}
            className="min-h-0 flex-1"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
