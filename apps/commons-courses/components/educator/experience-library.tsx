"use client";

import { useEffect, useState } from "react";
import { Gamepad2, Plus } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, List, ListRow } from "@/components/ui/surface";
import type { ExperienceSummaryDTO } from "@/types/experience";

export function ExperienceLibrary({ courseSlug }: { courseSlug: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<ExperienceSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/educator/courses/${courseSlug}/experiences`);
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (response.ok) setItems(data.experiences || []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [courseSlug]);

  async function createExperience() {
    setCreating(true);
    const response = await fetch(`/api/educator/courses/${courseSlug}/experiences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New immersive experience" }),
    });
    const data = await response.json().catch(() => ({}));
    setCreating(false);
    if (!response.ok || !data.experience?.id) {
      toast({
        tone: "error",
        title: "Could not create experience",
        description: data.error || "Please try again.",
      });
      return;
    }
    window.location.href = `/educator/experience-studio/${data.experience.id}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading" : `${items.length} experience${items.length === 1 ? "" : "s"}`}
        </p>
        <Button variant="primary" icon={Plus} loading={creating} onClick={createExperience}>
          New experience
        </Button>
      </div>

      {items.length ? (
        <List>
          {items.map((item) => (
            <ListRow
              key={item.id}
              href={`/educator/experience-studio/${item.id}`}
              leading={
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-900 text-white">
                  <Gamepad2 className="h-4 w-4" strokeWidth={1.75} />
                </span>
              }
              title={item.title}
              meta={`${item.sceneCount} scenes · ${item.characterCount} characters · draft v${item.draftVersion}`}
              trailing={
                <Badge tone={item.status === "published" ? "success" : "neutral"}>
                  {item.status === "published" ? "Published" : "Draft"}
                </Badge>
              }
            />
          ))}
        </List>
      ) : !loading ? (
        <EmptyState
          icon={Gamepad2}
          title="No experiences yet"
          description="Character-led stories, decisions and interactive checks, built in the Experience Studio."
          action={
            <Button variant="primary" icon={Plus} loading={creating} onClick={createExperience}>
              New experience
            </Button>
          }
        />
      ) : null}

    </div>
  );
}
