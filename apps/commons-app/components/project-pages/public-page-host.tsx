"use client";
import { useCallback, useState } from "react";
import { ProjectPageFrame } from "@agent-commons/ui";
import type { PublicProjectPage } from "@/lib/public-project-page";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
export function PublicPageHost({
  page,
  commonsBase = "",
}: {
  page: PublicProjectPage;
  commonsBase?: string;
}) {
  const [open, setOpen] = useState(false);
  const request = useCallback(() => setOpen(true), []);
  return (
    <div className="h-dvh w-full overflow-hidden bg-white">
      <ProjectPageFrame page={page} onChatDraftRequest={request} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask about {page.title}</DialogTitle>
            <DialogDescription>
              Open a chat in your Commons account with this page’s published
              information. Review the draft before sending it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button asChild>
              <a
                href={`${commonsBase}/p/${page.slug}/chat`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Continue in Commons
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
