"use client";

import { useEffect, useState, useCallback } from "react";
import { commons } from "@/lib/commons";
import { AgentMemory, MemoryType, CreateMemoryParams } from "@agent-commons/sdk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Brain,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  BookOpen,
  Zap,
  Cpu,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_META: Record<
  MemoryType,
  { label: string; color: string; icon: React.ReactNode }
> = {
  semantic: {
    label: "Fact",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icon: <BookOpen className="h-3 w-3" />,
  },
  episodic: {
    label: "Event",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    icon: <Zap className="h-3 w-3" />,
  },
  procedural: {
    label: "Behaviour",
    color: "bg-purple-100 text-purple-800 border-purple-200",
    icon: <Cpu className="h-3 w-3" />,
  },
};

function ImportanceDots({ score }: { score: number }) {
  const filled = Math.round(score * 5);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`block h-1.5 w-1.5 rounded-full ${
            i <= filled ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

function MemoryCard({
  memory,
  onDelete,
}: {
  memory: AgentMemory;
  onDelete: (id: string) => void;
}) {
  const meta = TYPE_META[memory.memoryType] ?? TYPE_META.semantic;

  return (
    <div className="group flex gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.color}`}
          >
            {meta.icon}
            {meta.label}
          </span>
          <ImportanceDots score={memory.importanceScore} />
          {memory.sourceType === "manual" && (
            <Badge variant="outline" className="text-xs">
              manual
            </Badge>
          )}
        </div>

        <p className="text-sm font-medium text-foreground leading-snug">
          {memory.summary}
        </p>

        {memory.content !== memory.summary && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {memory.content}
          </p>
        )}

        {(memory.tags as string[]).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(memory.tags as string[]).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
              onClick={() => onDelete(memory.memoryId)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete memory</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────────

function CreateMemoryDialog({
  agentId,
  onCreated,
}: {
  agentId: string;
  onCreated: (mem: AgentMemory) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    memoryType: MemoryType;
    summary: string;
    content: string;
    importanceScore: string;
    tags: string;
  }>({
    memoryType: "semantic",
    summary: "",
    content: "",
    importanceScore: "0.5",
    tags: "",
  });

  const handleSubmit = async () => {
    if (!form.summary.trim()) return;
    setSaving(true);
    try {
      const res = await commons.memory.create({
        agentId,
        memoryType: form.memoryType,
        summary: form.summary.trim(),
        content: form.content.trim() || form.summary.trim(),
        importanceScore: parseFloat(form.importanceScore) || 0.5,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onCreated(res.data);
      setOpen(false);
      setForm({
        memoryType: "semantic",
        summary: "",
        content: "",
        importanceScore: "0.5",
        tags: "",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Memory
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Memory</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select
              value={form.memoryType}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, memoryType: v as MemoryType }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semantic">Fact — general knowledge</SelectItem>
                <SelectItem value="episodic">Event — something that happened</SelectItem>
                <SelectItem value="procedural">Behaviour — rule or preference</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Summary (one line)</Label>
            <Input
              placeholder="User prefers concise bullet-point responses"
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Full content (optional)</Label>
            <Textarea
              placeholder="More detail…"
              className="h-20"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Importance (0–1)</Label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={form.importanceScore}
                onChange={(e) =>
                  setForm((f) => ({ ...f, importanceScore: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tags (comma-separated)</Label>
              <Input
                placeholder="user, preference"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              />
            </div>
          </div>

          <Button
            className="w-full"
            disabled={saving || !form.summary.trim()}
            onClick={handleSubmit}
          >
            {saving ? "Saving…" : "Save Memory"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AgentMemoryViewProps {
  agentId: string;
}

export function AgentMemoryView({ agentId }: AgentMemoryViewProps) {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<MemoryType | "all">("all");
  const [stats, setStats] = useState<{
    total: number;
    episodic: number;
    semantic: number;
    procedural: number;
    avgImportance: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [memRes, statRes] = await Promise.all([
        commons.memory.list(agentId),
        commons.memory.stats(agentId),
      ]);
      setMemories(memRes.data ?? []);
      setStats(statRes.data ?? null);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (memoryId: string) => {
    await commons.memory.delete(memoryId).catch(() => {});
    setMemories((prev) => prev.filter((m) => m.memoryId !== memoryId));
    setStats((s) => s ? { ...s, total: s.total - 1 } : s);
  };

  const handleCreated = (mem: AgentMemory) => {
    setMemories((prev) => [mem, ...prev]);
    setStats((s) =>
      s
        ? {
            ...s,
            total: s.total + 1,
            [mem.memoryType]: (s as any)[mem.memoryType] + 1,
          }
        : s,
    );
  };

  // Filtering
  const filtered = memories.filter((m) => {
    const matchesType = filterType === "all" || m.memoryType === filterType;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      m.summary.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q) ||
      (m.tags as string[]).some((t) => t.toLowerCase().includes(q));
    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Memory{stats ? ` (${stats.total})` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <CreateMemoryDialog agentId={agentId} onCreated={handleCreated} />
        </div>
      </div>

      {/* Stats strip */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {(["semantic", "episodic", "procedural"] as MemoryType[]).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType((c) => (c === t ? "all" : t))}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                filterType === t
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-border hover:bg-muted"
              }`}
            >
              <span className="block font-semibold">{(stats as any)[t]}</span>
              <span className="text-muted-foreground capitalize">{TYPE_META[t].label}s</span>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      {memories.length > 0 && (
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search memories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-8 text-sm"
          />
        </div>
      )}

      {/* Memory list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <Brain className="mx-auto h-6 w-6 text-muted-foreground/50 mb-2" />
          <p className="text-xs text-muted-foreground">
            {memories.length === 0
              ? "No memories yet. Memories are extracted automatically after each session."
              : "No memories match your search."}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[360px] pr-1">
          <div className="space-y-2">
            {filtered.map((mem) => (
              <MemoryCard key={mem.memoryId} memory={mem} onDelete={handleDelete} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
