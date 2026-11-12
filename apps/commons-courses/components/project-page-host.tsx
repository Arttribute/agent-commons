"use client";
import { useCallback, useState } from "react";
import {
  ProjectPageFrame,
  PublicPageChat,
  type ProjectPageFrameSession,
} from "@agent-commons/ui";
import "@agent-commons/ui/styles.css";
import type { PublicPage } from "@/lib/project-pages";
export function ProjectPageHost({
  page,
  session,
}: {
  page: PublicPage;
  session?: ProjectPageFrameSession;
  commonsUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const request = useCallback(() => setOpen(true), []);
  return (
    <div className="h-dvh w-full overflow-hidden bg-white">
      <ProjectPageFrame
        page={page}
        session={session}
        onChatDraftRequest={request}
      />
      <PublicPageChat
        page={page}
        open={open}
        onOpenChange={setOpen}
        apiBase={
          process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL ||
          "https://api.agentcommons.io"
        }
      />
    </div>
  );
}
