import { CourseMaterialViewer } from "@/components/course-material-viewer";

export default async function MaterialPresenterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="h-dvh overflow-hidden bg-slate-950">
      <CourseMaterialViewer materialId={id} syncMode="follower" presenter />
    </main>
  );
}
