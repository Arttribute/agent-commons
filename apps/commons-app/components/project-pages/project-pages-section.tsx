"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Plus, Loader2, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { projectPagesApi, type ProjectPage } from "@/hooks/use-project-pages";
export function ProjectPagesSection({
  projectId,
  projectName,
  agents,
  preferredAgentId,
}: {
  projectId: string;
  projectName: string;
  agents: Array<{ agentId: string; name: string }>;
  preferredAgentId?: string | null;
}) {
  const [pages, setPages] = useState<ProjectPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(projectName);
  const [slug, setSlug] = useState("");
  const [surface, setSurface] = useState("commons");
  const [template, setTemplate] = useState("blank");
  const [agentId, setAgentId] = useState(preferredAgentId || "");
  const load = useCallback(async () => {
    try {
      setPages(await projectPagesApi.list(projectId));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load pages");
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Globe className="h-4 w-4" strokeWidth={1.75} />
          Pages
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAgentId(preferredAgentId || agents[0]?.agentId || "");
            setOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Create page
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Your own design and code, hosted with this project. Import a web build
        or edit with chat.
      </p>
      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading pages…</p>
      ) : pages.length ? (
        <ul className="mt-4 divide-y">
          {pages.map((page) => (
            <li key={page.pageId}>
              <Link
                className="flex items-center justify-between gap-3 py-3 text-sm hover:text-foreground"
                href={`/projects/${projectId}/pages/${page.pageId}`}
              >
                <div>
                  <span className="font-medium">{page.draftConfig.title}</span>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {page.surface === "commonlab"
                      ? "CommonLab"
                      : page.surface === "business"
                        ? "Business"
                        : "Commons"}{" "}
                    · {page.status === "published" ? "Published" : "Draft"}
                  </p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : !error ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Create a page for your programme, business or project.
        </p>
      ) : null}
      {error && (
        <div className="mt-3 text-sm text-red-700" role="alert">
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-xl overflow-y-auto p-5">
            <DrawerHeader className="px-0">
              <DrawerTitle>Create a project page</DrawerTitle>
              <DrawerDescription>
                Start from a page or import your own build after creating it.
              </DrawerDescription>
            </DrawerHeader>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setError("");
                try {
                  const page = await projectPagesApi.create(projectId, {
                    title,
                    slug,
                    surface,
                    template,
                    agentId,
                    description: "",
                    chatEnabled: true,
                  });
                  setPages((p) => [page, ...p]);
                  setOpen(false);
                  window.location.assign(
                    `/projects/${projectId}/pages/${page.pageId}`,
                  );
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not create the page",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              <div>
                <Label htmlFor="page-title">Page title</Label>
                <Input
                  id="page-title"
                  required
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!slug)
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, ""),
                      );
                  }}
                />
              </div>
              <div>
                <Label htmlFor="page-slug">Page address</Label>
                <Input
                  id="page-slug"
                  required
                  pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  /p/{slug || "your-page"}
                </p>
              </div>
              <div>
                <Label htmlFor="page-surface">Where will it be used?</Label>
                <select
                  id="page-surface"
                  className="mt-1 h-9 w-full rounded-lg border bg-white px-3 text-sm"
                  value={surface}
                  onChange={(e) => setSurface(e.target.value)}
                >
                  <option value="commons">Commons</option>
                  <option value="commonlab">CommonLab</option>
                  <option value="business">Business</option>
                </select>
              </div>
              <div>
                <Label htmlFor="page-template">Starter</Label>
                <select
                  id="page-template"
                  className="mt-1 h-9 w-full rounded-lg border bg-white px-3 text-sm"
                  value={template}
                  onChange={(e) => {
                    setTemplate(e.target.value);
                    if (e.target.value === "ai-kids-camp") {
                      setTitle("AI Kids Hacker Camp");
                      setSlug("ai-kids-hacker-camp");
                      setSurface("commonlab");
                    }
                  }}
                >
                  <option value="blank">
                    Blank page / bring your own build
                  </option>
                  <option value="ai-kids-camp">AI Kids Hacker Camp</option>
                </select>
              </div>
              <div>
                <Label htmlFor="page-agent">Agent for editing</Label>
                <select
                  required
                  id="page-agent"
                  className="mt-1 h-9 w-full rounded-lg border bg-white px-3 text-sm"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                >
                  <option value="">Choose your agent</option>
                  {agents.map((a) => (
                    <option key={a.agentId} value={a.agentId}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <DrawerFooter className="px-0">
                <Button type="submit" disabled={saving || !agentId}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create page
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </DrawerFooter>
            </form>
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
