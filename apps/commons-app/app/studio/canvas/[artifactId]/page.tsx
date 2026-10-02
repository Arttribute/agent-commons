import { redirect } from "next/navigation";

/** Older links open the artifact in the Library canvas. */
export default async function CanvasArtifactPage({
  params,
}: {
  params: Promise<{ artifactId: string }>;
}) {
  const { artifactId } = await params;
  redirect(`/library/${encodeURIComponent(decodeURIComponent(artifactId))}`);
}
