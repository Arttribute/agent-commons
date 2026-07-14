"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Bot,
  MessageSquare,
  Wrench,
  BriefcaseBusiness,
  Workflow,
  Earth,
  LibraryBig,
  Logs,
  Wallet,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { useAgents } from "@/hooks/use-agents";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import { useWorkflows } from "@/hooks/use-workflows";
import { useTasks } from "@/hooks/use-tasks";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NAV_ITEMS = [
  { label: "Agents", path: "/studio/agents", icon: Bot, keywords: "agents" },
  { label: "Tools", path: "/studio/tools", icon: Wrench, keywords: "tools integrations" },
  { label: "Tasks", path: "/studio/tasks", icon: BriefcaseBusiness, keywords: "tasks queue" },
  { label: "Workflows", path: "/studio/workflows", icon: Workflow, keywords: "workflows automation" },
  { label: "Spaces", path: "/spaces", icon: Earth, keywords: "spaces rooms live" },
  { label: "Library", path: "/library", icon: LibraryBig, keywords: "library files documents collections" },
  { label: "Logs", path: "/logs", icon: Logs, keywords: "logs activity" },
  { label: "Wallets", path: "/wallets", icon: Wallet, keywords: "wallets usdc payments" },
];

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);

  // Only fetch while the palette is open — passing undefined skips the fetch.
  const scopedOwner = open ? userAddress : undefined;

  const { agents, loading: loadingAgents } = useAgents(scopedOwner);
  const { sessions, isLoading: loadingSessions } = useUserSessions(
    open ? userAddress : ""
  );
  const { workflows, loading: loadingWorkflows } = useWorkflows(
    scopedOwner,
    "user"
  );
  const { tasks, loading: loadingTasks } = useTasks({
    ownerId: scopedOwner,
    ownerType: "user",
  });

  const [tools, setTools] = useState<any[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingTools(true);
    fetch("/api/tools", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTools(Array.isArray(d?.data) ? d.data : []);
      })
      .catch(() => !cancelled && setTools([]))
      .finally(() => !cancelled && setLoadingTools(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const loading =
    loadingAgents ||
    loadingSessions ||
    loadingWorkflows ||
    loadingTasks ||
    loadingTools;

  const go = (path: string) => {
    onOpenChange(false);
    router.push(path);
  };

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    agents.forEach((a) => map.set(a.agentId, a.name || a.agentId));
    return map;
  }, [agents]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search agents, sessions, tools, tasks, workflows…" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>
          {loading ? (
            <span className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </span>
          ) : (
            "No results found."
          )}
        </CommandEmpty>

        <CommandGroup heading="Go to">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.path}
              value={`nav ${item.label} ${item.keywords}`}
              onSelect={() => go(item.path)}
            >
              <item.icon className="text-muted-foreground" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {agents.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Agents">
              {agents.map((a) => (
                <CommandItem
                  key={a.agentId}
                  value={`agent ${a.name} ${a.agentId}`}
                  onSelect={() => go(`/agents/${a.agentId}`)}
                >
                  <Bot className="text-muted-foreground" />
                  <span className="truncate">{a.name || a.agentId}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {sessions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Sessions">
              {sessions.slice(0, 40).map((s) => (
                <CommandItem
                  key={s.sessionId}
                  value={`session ${s.title || "New session"} ${s.sessionId}`}
                  onSelect={() => go(`/sessions/${s.sessionId}`)}
                >
                  <MessageSquare className="text-muted-foreground" />
                  <span className="truncate">{s.title || "New session"}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {agentNameById.get(s.agentId) || ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {tools.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tools">
              {tools.map((t) => (
                <CommandItem
                  key={t.toolId}
                  value={`tool ${t.name} ${t.toolId}`}
                  onSelect={() => go(`/studio/tools/${t.toolId}`)}
                >
                  <Wrench className="text-muted-foreground" />
                  <span className="truncate">{t.name || t.toolId}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tasks">
              {tasks.map((t) => (
                <CommandItem
                  key={t.taskId}
                  value={`task ${t.title} ${t.taskId}`}
                  onSelect={() => go(`/studio/tasks/${t.taskId}`)}
                >
                  <BriefcaseBusiness className="text-muted-foreground" />
                  <span className="truncate">{t.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {workflows.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Workflows">
              {workflows.map((w: any) => (
                <CommandItem
                  key={w.workflowId}
                  value={`workflow ${w.name || w.title} ${w.workflowId}`}
                  onSelect={() => go(`/studio/workflows/${w.workflowId}`)}
                >
                  <Workflow className="text-muted-foreground" />
                  <span className="truncate">{w.name || w.title || w.workflowId}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
