"use client";
import { useCallback, useEffect, useState } from "react";
import { Globe, Plus } from "lucide-react";
import { PageHeader, List, ListRow, EmptyState } from "@/components/ui/surface";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";

type Page = {
  pageId: string;
  projectId: string;
  projectName: string;
  slug: string;
  status: string;
  draftConfig: { title: string };
};
export function EducatorProjectPages({ commonsUrl }: { commonsUrl: string }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [projects, setProjects] = useState<
    Array<{ projectId: string; name: string }>
  >([]);
  const [agents, setAgents] = useState<
    Array<{ agentId: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(""),
    [slug, setSlug] = useState(""),
    [projectId, setProjectId] = useState(""),
    [agentId, setAgentId] = useState(""),
    [template, setTemplate] = useState("blank");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/educator/pages");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load pages.");
      setPages(data.pages || []);
      setProjects(data.projects || []);
      setAgents(data.agents || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load pages.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const input =
    "mt-1 h-9 w-full rounded-lg border border-border bg-white px-3 text-sm";
  return (
    <>
      <PageHeader
        title="Project pages"
        info="Your design and code, linked to a Commons project. Use any coding tool, then import its exported web build in the page editor."
        actions={
          <div className="flex gap-2">
          <ButtonLink href="/educator/registrations">Registrations</ButtonLink>
          <Button
            icon={Plus}
            onClick={() => {
              setAgentId(agents[0]?.agentId || "");
              setOpen(true);
            }}
          >
            Create page
          </Button>
          </div>
        }
      />
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading pages…</p>
      ) : pages.length ? (
        <List>
          {pages.map((page) => (
            <ListRow
              key={page.pageId}
              href={`${commonsUrl}/projects/${page.projectId}/pages/${page.pageId}`}
              title={page.draftConfig.title}
              meta={`${page.projectName} · ${page.status === "published" ? "Published" : "Draft"}`}
            />
          ))}
        </List>
      ) : !error ? (
        <EmptyState icon={Globe} title="Create a page for your programme" />
      ) : null}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Create a project page"
        description="Start here, then customise, import and publish in the Commons editor."
        as="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            const response = await fetch("/api/educator/pages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title,
                slug,
                projectId: projectId || undefined,
                agentId,
                template,
              }),
            });
            const data = await response.json();
            if (!response.ok)
              throw new Error(
                data.message || data.error || "Could not create the page.",
              );
            window.location.assign(
              `${commonsUrl}/projects/${data.data.projectId}/pages/${data.data.pageId}`,
            );
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not create the page.",
            );
          } finally {
            setSaving(false);
          }
        }}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={!agentId}
            >
              Create page
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm">
            Title
            <input
              className={input}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Page address
            <input
              className={input}
              required
              pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              /p/{slug || "your-programme"}
            </span>
          </label>
          <label className="block text-sm">
            Commons project
            <select
              className={input}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">New project with this title</option>
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Starter
            <select
              className={input}
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value);
                if (e.target.value === "ai-kids-camp") {
                  setTitle("AI Kids Hacker Camp");
                  setSlug("ai-kids-hacker-camp");
                }
              }}
            >
              <option value="blank">Blank / bring your own build</option>
              <option value="ai-kids-camp">AI Kids Hacker Camp</option>
            </select>
          </label>
          <label className="block text-sm">
            Agent for editing
            <select
              className={input}
              required
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
          </label>
          {!agents.length && (
            <ButtonLink href={`${commonsUrl}/agents`} external>
              Create an agent in Commons
            </ButtonLink>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </Drawer>
    </>
  );
}
