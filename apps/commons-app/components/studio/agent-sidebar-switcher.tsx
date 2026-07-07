"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type SwitcherAgent = {
  id: string;
  name: string;
  avatar?: string | null;
  modelId?: string | null;
};

/**
 * The studio agent switcher: shows the current agent's avatar/name and opens a
 * searchable popover to jump between the user's other agents.
 *
 * Two shapes share one popover:
 * - default (sidebar): a full identity block with the agent's model line.
 * - `compact`: a small inline pill, for embedding next to other controls.
 *
 * By default selecting an agent navigates to its studio page. Pass `onSelect`
 * to use it as a controlled picker (e.g. choosing which agent to start a
 * session with) — then no navigation happens.
 */
export function AgentSidebarSwitcher({
  current,
  items,
  compact = false,
  onSelect,
  placeholder = "No model selected",
}: {
  current: SwitcherAgent;
  items: SwitcherAgent[];
  compact?: boolean;
  onSelect?: (id: string) => void;
  placeholder?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.modelId || "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const openAgent = (id: string) => {
    setOpen(false);
    if (id === current.id) return;
    if (onSelect) {
      onSelect(id);
      return;
    }
    router.push(`/studio/agents/${id}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <button
            type="button"
            className="flex max-w-full items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-left transition-colors hover:bg-muted"
          >
            <AgentAvatar name={current.name} src={current.avatar} size={22} />
            <span className="min-w-0 truncate text-sm font-medium leading-none">
              {current.name || "Select agent"}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
          >
            <AgentAvatar name={current.name} src={current.avatar} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{current.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {current.modelId || placeholder}
              </p>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[288px] p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Switch agent..."
              className="h-8 border-0 bg-muted/50 pl-8 text-xs focus-visible:ring-1"
            />
          </div>
        </div>
        <ScrollArea className="max-h-[320px]">
          <div className="p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No agents found
              </p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent",
                    item.id === current.id && "bg-accent text-accent-foreground",
                  )}
                  onClick={() => openAgent(item.id)}
                >
                  <AgentAvatar name={item.name} src={item.avatar} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    {item.modelId && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.modelId}
                      </span>
                    )}
                  </span>
                  {item.id === current.id && <Check className="h-4 w-4 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
