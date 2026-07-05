"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, Search, Trash2, Globe, Lock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useSkills } from "@/hooks/use-skills";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { Skill } from "@agent-commons/sdk";

interface SkillsMarketplaceViewProps {
  userAddress: string;
  onRegisterCreate?: (fn: () => void) => void;
}

interface CreateSkillForm {
  slug: string;
  name: string;
  description: string;
  instructions: string;
  tools: string;
  triggers: string;
  tags: string;
  icon: string;
  isPublic: boolean;
}

const EMPTY_FORM: CreateSkillForm = {
  slug: "",
  name: "",
  description: "",
  instructions: "",
  tools: "",
  triggers: "",
  tags: "",
  icon: "",
  isPublic: false,
};

function SkillCard({
  skill,
  onDelete,
  onOpen,
  isOwner,
}: {
  skill: Skill;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  isOwner: boolean;
}) {
  const VisibilityIcon = skill.isPublic ? Globe : Lock;

  return (
    <div
      className="group flex h-full cursor-pointer flex-col rounded-xl border border-border bg-background p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
      onClick={() => onOpen(skill.skillId)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-lg dark:bg-amber-300/15">
          {skill.icon || (
            <Sparkles className="h-4 w-4 text-amber-900 dark:text-amber-200" strokeWidth={1.9} />
          )}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <VisibilityIcon
            className="h-3.5 w-3.5 text-muted-foreground/60"
            aria-label={skill.isPublic ? "Public" : "Private"}
          />
          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(skill.skillId);
              }}
              aria-label="Delete skill"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <h3 className="mt-3 truncate text-sm font-semibold text-foreground">{skill.name}</h3>
      <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs leading-4 text-muted-foreground">
        {skill.description}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <div className="flex min-w-0 flex-wrap gap-1">
          {skill.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
              {tag}
            </Badge>
          ))}
          {skill.tags.length > 3 && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground">
              +{skill.tags.length - 3}
            </Badge>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {skill.usageCount} uses
        </span>
      </div>
    </div>
  );
}

export function SkillsMarketplaceView({ userAddress, onRegisterCreate }: SkillsMarketplaceViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"platform" | "mine">("platform");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Allow parent to trigger create dialog via callback registration
  useEffect(() => {
    onRegisterCreate?.(() => setShowCreate(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateSkillForm>(EMPTY_FORM);

  const { toast } = useToast();

  const platformFilter = { ownerType: "platform", isPublic: true };
  const myFilter = userAddress ? { ownerId: userAddress } : undefined;

  const {
    skills: platformSkills,
    loading: loadingPlatform,
  } = useSkills(platformFilter);

  const {
    skills: mySkills,
    loading: loadingMine,
    refresh: refreshMine,
  } = useSkills(myFilter);

  const activeSkills = tab === "platform" ? platformSkills : mySkills;
  const loading = tab === "platform" ? loadingPlatform : loadingMine;

  const filtered = search.trim()
    ? activeSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.description.toLowerCase().includes(search.toLowerCase()) ||
          s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : activeSkills;

  const handleDelete = async (skillId: string) => {
    if (!confirm("Delete this skill?")) return;
    try {
      await fetch(`/api/skills/${skillId}`, { method: "DELETE" });
      toast({ title: "Skill deleted" });
      refreshMine();
    } catch {
      toast({ title: "Error", description: "Failed to delete skill", variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!form.slug || !form.name || !form.description || !form.instructions) {
      toast({ title: "Required fields missing", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: form.slug,
          name: form.name,
          description: form.description,
          instructions: form.instructions,
          tools: form.tools ? form.tools.split(",").map((s) => s.trim()).filter(Boolean) : [],
          triggers: form.triggers ? form.triggers.split(",").map((s) => s.trim()).filter(Boolean) : [],
          tags: form.tags ? form.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
          icon: form.icon || undefined,
          isPublic: form.isPublic,
          ownerId: userAddress,
          ownerType: "user",
          source: "user",
        }),
      });
      toast({ title: "Skill created" });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      refreshMine();
      setTab("mine");
    } catch {
      toast({ title: "Error", description: "Failed to create skill", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {/* Toolbar — creating a skill lives in the page header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="Search skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs value={tab} onValueChange={(value) => setTab(value as "platform" | "mine")}>
          <TabsList className="h-9">
            <TabsTrigger value="platform" className="text-xs">
              Platform
            </TabsTrigger>
            <TabsTrigger value="mine" className="text-xs">
              My skills
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {search ? "No skills match your search" : tab === "mine" ? "No skills yet" : "No platform skills"}
          </p>
          {!search && tab === "mine" && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              Create your first skill to add custom capabilities to your agents
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((skill) => (
            <SkillCard
              key={skill.skillId}
              skill={skill}
              onDelete={handleDelete}
              onOpen={(id) => router.push(`/studio/skills/${id}`)}
              isOwner={skill.ownerId === userAddress}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Skill</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Slug *</Label>
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="my-skill"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Icon</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="🔍"
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Web Research"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Short one-line description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Instructions * (Markdown)</Label>
              <Textarea
                className="text-xs font-mono min-h-32 resize-y"
                placeholder="## My Skill&#10;&#10;When asked to..."
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Tools (comma-separated)</Label>
              <Input
                className="h-8 text-xs"
                placeholder="web_search, fetch_url"
                value={form.tools}
                onChange={(e) => setForm((f) => ({ ...f, tools: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Trigger phrases (comma-separated)</Label>
              <Input
                className="h-8 text-xs"
                placeholder="search for, look up, find"
                value={form.triggers}
                onChange={(e) => setForm((f) => ({ ...f, triggers: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input
                className="h-8 text-xs"
                placeholder="research, web, search"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="public-toggle"
                checked={form.isPublic}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isPublic: v }))}
              />
              <Label htmlFor="public-toggle" className="text-xs cursor-pointer">
                Make publicly discoverable
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
