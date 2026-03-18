"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Sparkles, Search, Plus, Trash2, Globe, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSkills } from "@/hooks/use-skills";
import { commons } from "@/lib/commons";
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
  isOwner,
}: {
  skill: Skill;
  onDelete: (id: string) => void;
  isOwner: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/60 rounded-lg p-4 bg-card hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {skill.icon ? (
            <span className="text-xl leading-none shrink-0">{skill.icon}</span>
          ) : (
            <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{skill.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{skill.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {skill.isPublic ? (
            <Globe className="h-3 w-3 text-muted-foreground" />
          ) : (
            <Lock className="h-3 w-3 text-muted-foreground" />
          )}
          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onDelete(skill.skillId)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{skill.description}</p>

      {skill.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {skill.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {skill.tools.length > 0 && (
        <p className="text-[11px] text-muted-foreground/70 mt-2">
          Tools: {skill.tools.join(", ")}
        </p>
      )}

      <button
        className="text-[11px] text-primary mt-2 hover:underline"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Hide instructions" : "View instructions"}
      </button>

      {expanded && (
        <pre className="text-[11px] text-muted-foreground mt-2 whitespace-pre-wrap bg-muted/40 rounded p-2 max-h-48 overflow-y-auto font-mono">
          {skill.instructions}
        </pre>
      )}

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40">
        <span className="text-[10px] text-muted-foreground/60">
          v{skill.version} · {skill.source}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {skill.usageCount} uses
        </span>
      </div>
    </div>
  );
}

export function SkillsMarketplaceView({ userAddress, onRegisterCreate }: SkillsMarketplaceViewProps) {
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
    refresh: refreshPlatform,
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
      await commons.skills.delete(skillId);
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
      await commons.skills.create({
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
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex border border-border/60 rounded-md overflow-hidden text-xs">
          <button
            className={`px-3 py-1.5 transition-colors ${tab === "platform" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setTab("platform")}
          >
            Platform Skills
          </button>
          <button
            className={`px-3 py-1.5 transition-colors ${tab === "mine" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setTab("mine")}
          >
            My Skills
          </button>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder="Search skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Button size="sm" className="h-8 gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" />
          New Skill
        </Button>
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
