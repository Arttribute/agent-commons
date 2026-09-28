"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderClosed, Laptop, Pin, Search } from "lucide-react";
import { CreateButton, PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { useProjects } from "@/hooks/use-projects";
import { relativeTime } from "@/lib/relative-time";

export default function ProjectsPage() {
  const router = useRouter();
  const { projects, loading, error, refresh } = useProjects();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value
      ? projects.filter((project) => `${project.name} ${project.description ?? ""}`.toLowerCase().includes(value))
      : projects;
  }, [projects, query]);

  return (
    <div className="mx-auto w-full max-w-5xl pb-12">
      <PageHeader title="Projects">
        {projects.length > 4 && (
          <div className="relative hidden w-60 sm:block">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" className="h-9 pl-8" />
          </div>
        )}
        <CreateButton label="New project" onClick={() => setCreateOpen(true)} />
      </PageHeader>

      <div className="px-6">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[104px] rounded-xl" />)}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">Projects could not be loaded.</p>
            <button type="button" onClick={() => void refresh()} className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Try again</button>
          </div>
        ) : !projects.length ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-white">
              <FolderClosed className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            </span>
            <h2 className="mt-4 text-base font-medium">Keep related work together</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              A project gives its chats the same instructions, files, and knowledge.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-5 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-85"
            >
              New project
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((project) => (
              <Link
                key={project.projectId}
                href={`/projects/${encodeURIComponent(project.projectId)}`}
                className="group flex min-h-[104px] flex-col rounded-xl border border-border bg-white p-4 shadow-card transition-colors hover:border-foreground/20"
              >
                <span className="flex items-center gap-2">
                  <FolderClosed className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</span>
                  {project.pinned && <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
                </span>
                <span className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">
                  {project.description || "No description"}
                </span>
                <span className="mt-auto flex items-center gap-1.5 pt-3 text-xs text-muted-foreground">
                  {project.location === "local" && <Laptop className="h-3 w-3" aria-label="On this computer" />}
                  {project.sessionCount} {project.sessionCount === 1 ? "chat" : "chats"} · Updated {relativeTime(project.lastActivityAt)}
                </span>
              </Link>
            ))}
            {!visible.length && <p className="text-sm text-muted-foreground">No projects match your search.</p>}
          </div>
        )}
      </div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(project) => router.push(`/projects/${encodeURIComponent(project.projectId)}`)}
      />
    </div>
  );
}
