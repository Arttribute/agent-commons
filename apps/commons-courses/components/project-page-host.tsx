"use client";
import { useCallback, useState } from "react";
import { ProjectPageFrame } from "@agent-commons/ui";
import { Drawer } from "@/components/ui/drawer";
import { Button, ButtonLink } from "@/components/ui/button";
import type { PublicPage } from "@/lib/project-pages";
export function ProjectPageHost({
  page,
  commonsUrl,
}: {
  page: PublicPage;
  commonsUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const request = useCallback(() => setOpen(true), []);
  return (
    <div className="h-dvh w-full overflow-hidden bg-white">
      <ProjectPageFrame page={page} onChatDraftRequest={request} />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Ask about ${page.title}`}
        description="Open a chat in your Commons account with this page’s published information. Review the draft before sending it."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <ButtonLink
              variant="primary"
              href={`${commonsUrl}/p/${page.slug}/chat`}
              external
            >
              Continue in Commons
            </ButtonLink>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Your conversation uses your own account and agent. This page does not
          receive your credentials.
        </p>
      </Drawer>
    </div>
  );
}
