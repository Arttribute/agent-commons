"use client";
import { useCallback, useState } from "react";
import {
  ProjectPageFrame,
  PublicPageChat,
  type ProjectPageFrameSession,
} from "@agent-commons/ui";
import "@agent-commons/ui/styles.css";
import type { PublicProjectPage } from "@/lib/public-project-page";
export function PublicPageHost({
  page,
  session,
}: {
  page: PublicProjectPage;
  session?: ProjectPageFrameSession;
  commonsBase?: string;
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
          process.env.NEXT_PUBLIC_NEST_API_BASE_URL ||
          "https://api.agentcommons.io"
        }
      />
    </div>
  );
}
