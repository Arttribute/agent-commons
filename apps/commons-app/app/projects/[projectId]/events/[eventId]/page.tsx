import { ProjectEventManager } from "@/components/project-pages/project-events";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; eventId: string }>;
}) {
  const { projectId, eventId } = await params;
  return <ProjectEventManager projectId={projectId} eventId={eventId} />;
}
