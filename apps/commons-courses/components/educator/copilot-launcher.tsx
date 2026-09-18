"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  BarChart3,
  BookOpen,
  FileText,
  Library,
  Paperclip,
  Plus,
  Radio,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const COPILOT_LAUNCH_EVENT = "educator-copilot:launch";

export type CopilotLaunchDetail = { message: string; files: File[] };

/** Hand a message (and files) to the educator copilot panel. */
export function launchEducatorCopilot(detail: CopilotLaunchDetail) {
  window.dispatchEvent(new CustomEvent<CopilotLaunchDetail>(COPILOT_LAUNCH_EVENT, { detail }));
}

const shortcutIcons: Record<string, LucideIcon> = {
  course: BookOpen,
  courses: Library,
  new: Plus,
  analytics: BarChart3,
  ai: Sparkles,
  live: Radio,
};

export type LauncherShortcut = {
  href: string;
  label: string;
  icon?: keyof typeof shortcutIcons;
  dot?: "live" | "draft" | "published";
};

/**
 * Chat-first entry to the educator console. One composer, and a single row
 * of shortcuts beneath it for going straight to a place without chatting.
 */
export function CopilotLauncher({
  greeting,
  shortcuts,
}: {
  greeting: string;
  shortcuts: LauncherShortcut[];
}) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = message.trim().length > 0 || files.length > 0;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    launchEducatorCopilot({ message: message.trim(), files });
    setMessage("");
    setFiles([]);
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[46rem]">
        <p className="mb-2 text-center text-sm text-muted-foreground">{greeting}</p>
        <h1 className="mb-7 text-center text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
          What are we teaching today?
        </h1>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-border bg-white shadow-floating transition-shadow focus-within:border-stone-300"
        >
          {files.length ? (
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {files.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-xs text-stone-600"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="max-w-48 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={3}
            autoFocus
            placeholder="Ask your copilot to build a lesson, review submissions, plan a live session, or find anything."
            className="block w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-6 outline-none placeholder:text-stone-400"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.docx,.xlsx,.xls,.pptx,.png,.jpg,.jpeg,.webp,.md,.markdown,.txt,.csv,.json"
            onChange={(event) => {
              setFiles((current) => [...current, ...Array.from(event.target.files || [])].slice(0, 8));
              event.currentTarget.value = "";
            }}
          />
          <div className="flex items-center justify-between px-3 pb-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Paperclip className="h-4 w-4" strokeWidth={1.75} />
              Attach material
            </button>
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send to copilot"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white transition-opacity hover:opacity-85 disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </form>

        {shortcuts.length ? (
          <nav aria-label="Shortcuts" className="mt-4 flex flex-wrap justify-center gap-2">
            {shortcuts.map((shortcut) => {
              const Icon = shortcutIcons[shortcut.icon || "course"] || BookOpen;
              return (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs text-stone-600 shadow-card transition-colors hover:bg-muted hover:text-foreground"
                >
                  {shortcut.dot ? (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        shortcut.dot === "live"
                          ? "animate-pulse bg-red-500"
                          : shortcut.dot === "published"
                            ? "bg-emerald-500"
                            : "bg-stone-300",
                      )}
                    />
                  ) : (
                    <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  )}
                  <span className="truncate">{shortcut.label}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
