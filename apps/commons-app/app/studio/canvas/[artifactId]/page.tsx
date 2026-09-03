import { CanvasStudio } from "@/components/canvas/canvas-studio";

export default async function CanvasArtifactPage({
  params,
}: {
  params: Promise<{ artifactId: string }>;
}) {
  const { artifactId } = await params;
  return <CanvasStudio artifactId={decodeURIComponent(artifactId)} />;
}
