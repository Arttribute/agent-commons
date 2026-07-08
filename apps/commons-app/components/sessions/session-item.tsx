"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Bot,
  Terminal,
  MoreVertical,
  Pencil,
  Link2,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export interface SessionItemData {
  sessionId: string;
  agentId: string;
  title?: string | null;
  initiatorType?: string;
  source?: string;
}

interface SessionItemProps {
  session: SessionItemData;
  isActive?: boolean;
  /** Live-typing title while the agent names a brand-new session. */
  isStreamingTitle?: boolean;
  streamingTitleText?: string;
  variant?: "sidebar" | "card";
  /**
   * Overrides the default navigation. When provided, clicking the row calls
   * this instead of routing to the session page — used by in-page selectors
   * that swap a detail pane rather than navigate.
   */
  onSelect?: (sessionId: string) => void;
  /** Renames a session. Return true on success. Menu is hidden when omitted. */
  onRename?: (sessionId: string, title: string) => Promise<boolean> | boolean;
  /** Deletes a session. Return true on success. Menu is hidden when omitted. */
  onDelete?: (sessionId: string) => Promise<boolean> | boolean;
}

export function SessionItem({
  session,
  isActive = false,
  isStreamingTitle = false,
  streamingTitleText = "",
  variant = "sidebar",
  onSelect,
  onRename,
  onDelete,
}: SessionItemProps) {
  const router = useRouter();
  const { toast } = useToast();
  const href = `/agents/${session.agentId}/${session.sessionId}`;
  const isCli =
    session.initiatorType === "cli" || (session as any).source === "cli";

  const fallbackTitle = session.title || "New session";
  const displayTitle = isStreamingTitle
    ? streamingTitleText || "..."
    : fallbackTitle;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(fallbackTitle);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const hasActions = Boolean(onRename || onDelete);

  const startRename = () => {
    setDraft(fallbackTitle);
    setIsEditing(true);
  };

  const commitRename = async () => {
    const next = draft.trim();
    if (!next || next === fallbackTitle || !onRename) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onRename(session.sessionId, next);
    setSaving(false);
    setIsEditing(false);
    if (!ok) {
      toast({ title: "Couldn't rename session", variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!onDelete) return;
    const ok = await onDelete(session.sessionId);
    setConfirmOpen(false);
    if (!ok) {
      toast({ title: "Couldn't delete session", variant: "destructive" });
    }
  };

  const copyLink = async () => {
    try {
      const url =
        typeof window !== "undefined" ? window.location.origin + href : href;
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Couldn't copy link", variant: "destructive" });
    }
  };

  const navigate = () => {
    if (isEditing) return;
    if (onSelect) {
      onSelect(session.sessionId);
      return;
    }
    router.push(href);
  };

  const ActionsMenu = hasActions ? (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Session actions"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground data-[state=open]:bg-background/80 data-[state=open]:text-foreground"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-40"
          onClick={(e) => e.stopPropagation()}
        >
          {onRename && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                startRename();
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              copyLink();
            }}
          >
            <Link2 className="mr-2 h-4 w-4" />
            Copy link
          </DropdownMenuItem>
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(e) => {
                  e.preventDefault();
                  setConfirmOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{fallbackTitle}&rdquo; will be permanently removed. This
              can&rsquo;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  ) : null;

  const titleNode = isEditing ? (
    <input
      ref={inputRef}
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitRename();
        if (e.key === "Escape") setIsEditing(false);
      }}
      onBlur={commitRename}
      className={cn(
        "w-full rounded-sm bg-background px-1.5 py-0.5 outline-none ring-1 ring-ring",
        variant === "sidebar" ? "text-sm" : "text-sm font-medium"
      )}
    />
  ) : (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 truncate leading-tight text-foreground",
        variant === "sidebar" ? "text-sm" : "text-sm font-medium"
      )}
    >
      <span className="truncate">{displayTitle}</span>
      {isStreamingTitle && (
        <span className="ml-0.5 inline-block h-3.5 w-0.5 shrink-0 animate-pulse bg-current" />
      )}
    </span>
  );

  if (variant === "card") {
    return (
      <div
        role="link"
        tabIndex={0}
        onClick={navigate}
        onKeyDown={(e) => e.key === "Enter" && navigate()}
        className="group flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:bg-accent/40"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
            {isCli ? (
              <Terminal className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Bot className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            {titleNode}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {session.agentId}
            </p>
          </div>
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-2">
          {isCli && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Terminal className="h-2.5 w-2.5" />
              CLI
            </Badge>
          )}
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            ActionsMenu
          )}
        </div>
      </div>
    );
  }

  // sidebar variant
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={navigate}
      onKeyDown={(e) => e.key === "Enter" && navigate()}
      className={cn(
        "group flex cursor-pointer items-center gap-1 rounded-md px-2 py-2 transition-colors",
        isActive ? "bg-accent" : "hover:bg-accent/60"
      )}
    >
      <div className="min-w-0 flex-1">{titleNode}</div>
      {saving ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        ActionsMenu
      )}
    </div>
  );
}
