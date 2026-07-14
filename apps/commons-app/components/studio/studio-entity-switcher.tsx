"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, ChevronsUpDown, Search, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type StudioEntity = {
  id: string;
  name: string;
  description?: string | null;
};

type StudioEntitySwitcherProps = {
  type: "agent" | "workflow";
  currentId: string;
  currentName: string;
  items: StudioEntity[];
};

export function StudioEntitySwitcher({
  type,
  currentId,
  currentName,
  items,
}: StudioEntitySwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const Icon = type === "agent" ? Bot : Workflow;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    );
  }, [items, query]);

  const openEntity = (id: string) => {
    setOpen(false);
    router.push(
      type === "agent" ? `/studio/agents/${id}` : `/studio/workflows/${id}`
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 max-w-[320px] justify-between gap-2 rounded-md px-2.5"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{currentName}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Find ${type === "agent" ? "agent" : "workflow"}...`}
              className="h-8 border-0 bg-muted/50 pl-8 text-xs focus-visible:ring-1"
            />
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto overscroll-contain">
          <div className="p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No matches found
              </p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent",
                    item.id === currentId && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => openEntity(item.id)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.name}</span>
                    {item.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                  </span>
                  {item.id === currentId && <Check className="h-4 w-4" />}
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
