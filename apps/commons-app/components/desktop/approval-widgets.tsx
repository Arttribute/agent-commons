"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import type { ApprovalRequest } from "@agent-commons/desktop-contract";
import { Check, ChevronDown, ChevronRight, FilePenLine, ShieldAlert, SquareTerminal, X } from "lucide-react";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Source = "local" | "cloud";
type Entry = {
  approval: ApprovalRequest;
  source: Source;
  state: "pending" | "allowed" | "denied" | "expired";
  receivedAt: number;
};

type ApprovalStore = {
  entries: Record<string, Entry>;
  /** Chats currently on screen; their approvals render inline, not in the tray. */
  visibleChats: Record<string, number>;
  add: (approval: ApprovalRequest, source: Source) => void;
  settle: (id: string, state: Entry["state"]) => void;
  showChat: (sessionId: string) => () => void;
  clearSource: (source: Source) => void;
};

export const useApprovalStore = create<ApprovalStore>((set) => ({
  entries: {},
  visibleChats: {},
  add: (approval, source) => set((current) => current.entries[approval.id]
    ? current
    : { entries: { ...current.entries, [approval.id]: { approval, source, state: "pending", receivedAt: Date.now() } } }),
  settle: (id, state) => set((current) => current.entries[id] && current.entries[id].state === "pending"
    ? { entries: { ...current.entries, [id]: { ...current.entries[id], state } } }
    : current),
  showChat: (sessionId) => {
    set((current) => ({ visibleChats: { ...current.visibleChats, [sessionId]: (current.visibleChats[sessionId] ?? 0) + 1 } }));
    return () => set((current) => {
      const count = (current.visibleChats[sessionId] ?? 1) - 1;
      const { [sessionId]: _removed, ...rest } = current.visibleChats;
      return { visibleChats: count > 0 ? { ...rest, [sessionId]: count } : rest };
    });
  },
  clearSource: (source) => set((current) => ({
    entries: Object.fromEntries(Object.entries(current.entries).map(([id, entry]) => [
      id,
      entry.source === source && entry.state === "pending" ? { ...entry, state: "expired" as const } : entry,
    ])),
  })),
}));

async function answer(entry: Entry, allow: boolean, remember = false) {
  useApprovalStore.getState().settle(entry.approval.id, allow ? "allowed" : "denied");
  if (entry.source === "local") await window.agentCommonsLocal?.approve(entry.approval.id, allow, remember);
  else await window.agentCommonsDesktop?.answerApproval(entry.approval.id, allow, remember);
}

/** Listens for approval requests from the desktop app in both modes. Mounted once. */
export function DesktopApprovalBridge() {
  const { mode } = useWorkspaceMode();
  useEffect(() => {
    const store = useApprovalStore.getState();
    if (mode === "private-local" && window.agentCommonsLocal) {
      store.clearSource("cloud");
      return window.agentCommonsLocal.onEvent((event) => {
        if (event.type === "approval") useApprovalStore.getState().add(event.approval, "local");
        if (event.type === "approval-resolved") useApprovalStore.getState().settle(event.id, event.allow ? "allowed" : "expired");
      });
    }
    if (mode === "cloud" && window.agentCommonsDesktop) {
      store.clearSource("local");
      const offApproval = window.agentCommonsDesktop.onApproval((approval) => useApprovalStore.getState().add(approval, "cloud"));
      const offResolved = window.agentCommonsDesktop.onApprovalResolved((id) => useApprovalStore.getState().settle(id, "expired"));
      return () => { offApproval(); offResolved(); };
    }
  }, [mode]);
  return <ApprovalTray />;
}

function iconFor(approval: ApprovalRequest) {
  if (/write|note|save|register|create/.test(approval.permission)) return FilePenLine;
  if (/command|process/.test(approval.permission)) return SquareTerminal;
  return ShieldAlert;
}

/**
 * One approval, one line. The summary expands into a fixed-height scrolling
 * view so long commands or file edits never push the buttons out of reach.
 */
export function ApprovalCard({ entry, compact = false }: { entry: Entry; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { approval, state } = entry;
  const Icon = iconFor(approval);
  const title = approval.title || approval.summary.split("\n")[0] || approval.permission;
  const pending = state === "pending";

  const respond = async (allow: boolean, remember = false) => {
    setBusy(true);
    try { await answer(entry, allow, remember); } finally { setBusy(false); }
  };

  return (
    <div
      className={cn(
        "not-prose w-full max-w-full overflow-hidden rounded-xl border bg-background",
        pending ? "border-amber-200/80 shadow-card" : "border-border/70",
        compact && "shadow-floating",
      )}
      role={pending ? "alertdialog" : undefined}
      aria-label={pending ? "Permission needed" : undefined}
    >
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          title={open ? "Hide details" : "Show details"}
        >
          <Icon className={cn("h-3.5 w-3.5 shrink-0", pending ? "text-amber-600" : "text-muted-foreground")} />
          <span className={cn("min-w-0 truncate text-[13px]", pending ? "text-foreground" : "text-muted-foreground")}>
            {!pending && (state === "allowed" ? "Allowed · " : state === "denied" ? "Denied · " : "Expired · ")}
            <span className="font-mono text-[12px]">{title}</span>
          </span>
          {open ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
        </button>
        {pending ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void respond(false)}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              Deny
            </button>
            <div className="flex items-center overflow-hidden rounded-md bg-foreground text-background">
              <button
                type="button"
                disabled={busy}
                onClick={() => void respond(true)}
                className="px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                Allow
              </button>
              {approval.conversationId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" disabled={busy} className="border-l border-background/20 px-1 py-1 hover:opacity-85" aria-label="More approval options">
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => void respond(true, true)}>
                      <Check className="mr-2 h-4 w-4" /> Always allow in this chat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        ) : state === "allowed" ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>
      {open && (
        <div className="border-t border-border/70">
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words bg-muted/30 px-3 py-2.5 font-mono text-[11.5px] leading-5 text-foreground/80">
            {approval.summary}
          </pre>
          {approval.note && <p className="border-t border-border/70 px-3 py-2 text-[11px] leading-4 text-muted-foreground">{approval.note}</p>}
        </div>
      )}
    </div>
  );
}

/** Approvals for one chat, rendered inside the conversation. */
export function InlineApprovals({ sessionId }: { sessionId: string }) {
  const entries = useApprovalStore((state) => state.entries);
  useEffect(() => (sessionId ? useApprovalStore.getState().showChat(sessionId) : undefined), [sessionId]);
  const mine = Object.values(entries)
    .filter((entry) => entry.approval.conversationId === sessionId)
    .filter((entry) => entry.state === "pending" || Date.now() - entry.receivedAt < 30 * 60_000)
    .sort((left, right) => left.receivedAt - right.receivedAt);
  if (!sessionId || !mine.length) return null;
  return (
    <div className="my-2 space-y-1.5">
      {mine.map((entry) => <ApprovalCard key={entry.approval.id} entry={entry} />)}
    </div>
  );
}

/** Pending approvals whose chat is not on screen, in a small corner stack. */
function ApprovalTray() {
  const entries = useApprovalStore((state) => state.entries);
  const visibleChats = useApprovalStore((state) => state.visibleChats);
  const waiting = Object.values(entries).filter((entry) =>
    entry.state === "pending" && !(entry.approval.conversationId && visibleChats[entry.approval.conversationId]));
  if (!waiting.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[min(420px,calc(100vw-2rem))] space-y-2" aria-live="polite">
      {waiting.slice(0, 3).map((entry) => <ApprovalCard key={entry.approval.id} entry={entry} compact />)}
      {waiting.length > 3 && <p className="text-right text-xs text-muted-foreground">{waiting.length - 3} more waiting</p>}
    </div>
  );
}
