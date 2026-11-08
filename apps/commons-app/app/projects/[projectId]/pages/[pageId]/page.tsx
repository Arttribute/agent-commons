import { ProjectPageEditor } from "@/components/project-pages/project-page-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; pageId: string }>;
}) {
  const { projectId, pageId } = await params;
  return <ProjectPageEditor projectId={projectId} pageId={pageId} />;
}
