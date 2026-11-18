"use client";
import { useCallback, useEffect, useState } from "react";
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
  useEffect(() => {
    // The child frame has installed its normal bridge before this effect runs.
    window.dispatchEvent(
      new CustomEvent("commons-page:hydrated", {
        detail: { nonce: session?.nonce },
      }),
    );
  }, [session?.nonce]);
  return (
    <div
      data-commons-page-host
      className="w-full overflow-hidden bg-white supports-[height:100dvh]:[--commons-page-height:100dvh]"
      style={{ height: "var(--commons-page-height, 100vh)" }}
    >
      <ProjectPageFrame
        page={page}
        session={session}
        onChatDraftRequest={request}
      />
      <PublicPageChat
        page={page}
        open={open}
        onOpenChange={setOpen}
        apiBase="/api"
      />
    </div>
  );
}
