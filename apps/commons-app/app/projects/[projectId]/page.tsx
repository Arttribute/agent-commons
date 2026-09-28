"use client";

import { useParams } from "next/navigation";
import { ProjectView } from "@/components/projects/project-view";

export default function ProjectPage() {
  const { projectId } = useParams() as { projectId: string };
  return <ProjectView projectId={decodeURIComponent(projectId)} />;
}
