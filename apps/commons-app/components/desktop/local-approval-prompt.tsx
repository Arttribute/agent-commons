"use client";

import { useEffect, useState } from "react";
import type { ApprovalRequest } from "@agent-commons/desktop-contract";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

/** The Commons shell owns Local tool approvals, so every chat and agent uses
 * the same prompt instead of depending on the old Local renderer. */
export function LocalApprovalPrompt() {
  const { mode } = useWorkspaceMode();
  const [queue, setQueue] = useState<ApprovalRequest[]>([]);
  const current = queue[0];

  useEffect(() => {
    if (mode !== "private-local" || !window.agentCommonsLocal) return;
    return window.agentCommonsLocal.onEvent((event) => {
      if (event.type === "approval") setQueue((items) => items.some((item) => item.id === event.approval.id) ? items : [...items, event.approval]);
    });
  }, [mode]);

  useEffect(() => { if (mode !== "private-local") setQueue([]); }, [mode]);

  const answer = async (allow: boolean) => {
    if (!current) return;
    setQueue((items) => items.filter((item) => item.id !== current.id));
    await window.agentCommonsLocal?.approve(current.id, allow);
  };

  return <AlertDialog open={Boolean(current)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Allow this Local agent action?</AlertDialogTitle>
        <AlertDialogDescription className="whitespace-pre-wrap break-words">{current?.summary}</AlertDialogDescription>
      </AlertDialogHeader>
      <p className="text-xs text-muted-foreground">Permission: {current?.permission}. This action runs on your computer.</p>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={() => void answer(false)}>Deny</AlertDialogCancel>
        <AlertDialogAction onClick={() => void answer(true)}>Allow</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
