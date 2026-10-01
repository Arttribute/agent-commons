"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderClosed, LayoutGrid } from "lucide-react";
import { useProjects } from "@/hooks/use-projects";
import { cn } from "@/lib/utils";

/** Project navigation lives beside the project workspace, like Knowledge. */
export function ProjectNavigation() {
  const pathname = usePathname() ?? "";
  const { projects } = useProjects();
  if (!/^\/projects\/[^/]+/.test(pathname)) return null;
  const currentId = decodeURIComponent(pathname.split("/")[2] ?? "");

  return <nav aria-label="Project folders" className="hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-white md:flex">
    <div className="border-b border-border px-4 py-4 text-sm font-medium">Projects</div>
    <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
      <Link href="/projects" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><LayoutGrid className="h-4 w-4" /> All projects</Link>
      {projects.map((project) => <Link key={project.projectId} href={`/projects/${encodeURIComponent(project.projectId)}`} title={project.name} aria-current={project.projectId === currentId ? "page" : undefined} className={cn("flex items-center gap-2 rounded-lg px-2 py-2 text-sm", project.projectId === currentId ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><FolderClosed className="h-4 w-4 shrink-0" /><span className="truncate">{project.name}</span></Link>)}
    </div>
  </nav>;
}
