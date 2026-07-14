import { redirect } from "next/navigation";

/**
 * Legacy session URL. Sessions now live at /sessions/[sessionId] (with the
 * standard dashboard sidebar); old links redirect there.
 */
export default async function LegacyAgentSessionPage({
  params,
}: {
  params: Promise<{ agent: string; session: string }>;
}) {
  const { session } = await params;
  redirect(`/sessions/${session}`);
}
