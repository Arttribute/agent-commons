"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FileCode2 } from "lucide-react";
import type { CanvasAnnotation } from "@/lib/canvas";
import { cn } from "@/lib/utils";
import { noteTarget } from "../canvas-notes";
import { SelectionBubble, useSelectionBubble, type StageProps } from "./stage-kit";

export type SourceFile = { path: string; content: string };

export function SourceView({
  files,
  initialPath,
  notes,
  numberOf,
  focusedNoteId,
  canAnnotate,
  onDraft,
  onOpenNote,
  onViewer,
}: {
  files: SourceFile[];
  initialPath?: string;
  notes: CanvasAnnotation[];
  numberOf: StageProps["numberOf"];
  focusedNoteId?: string | null;
  canAnnotate: boolean;
  onDraft: StageProps["onDraft"];
  onOpenNote: StageProps["onOpenNote"];
  onViewer: StageProps["onViewer"];
}) {
  const [activePath, setActivePath] = useState(initialPath && files.some((file) => file.path === initialPath) ? initialPath : files[0]?.path);
  const active = files.find((file) => file.path === activePath) ?? files[0];
  const code = useRef<HTMLDivElement>(null);
  const { selection, clear } = useSelectionBubble(code, canAnnotate);

  useEffect(() => {
    if (active) onViewer({ view: "source", sourceFile: active.path });
  }, [active, onViewer]);

  // Jump to the file of a focused source note.
  useEffect(() => {
    const note = notes.find((entry) => entry.annotationId === focusedNoteId);
    const target = note ? noteTarget(note) : undefined;
    if (target?.type !== "source") return;
    setActivePath(target.file);
    window.setTimeout(() => {
      code.current?.querySelector(`[data-line="${target.lineStart}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
  }, [focusedNoteId, notes]);

  const fileNotes = useMemo(
    () =>
      notes.filter((note) => {
        const target = noteTarget(note);
        return target?.type === "source" && target.file === active?.path;
      }),
    [active?.path, notes],
  );
  const notedLines = useMemo(() => {
    const lines = new Map<number, CanvasAnnotation>();
    for (const note of fileNotes) {
      const target = noteTarget(note);
      if (target?.type !== "source") continue;
      for (let line = target.lineStart; line <= target.lineEnd; line += 1) {
        if (!lines.has(line)) lines.set(line, note);
      }
    }
    return lines;
  }, [fileNotes]);

  if (!active) {
    return <div className="flex h-full items-center justify-center text-xs text-stone-500">No source is available.</div>;
  }

  const addNote = () => {
    if (!selection) return;
    const lineOf = (node: Node) =>
      Number((node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-line]")?.dataset.line);
    let start = lineOf(selection.range.startContainer);
    let end = lineOf(selection.range.endContainer);
    if (!start || !end) return;
    if (end < start) [start, end] = [end, start];
    // A selection that ends at the very start of a line does not include it.
    if (end > start && selection.range.endOffset === 0) end -= 1;
    const lines = active.content.split("\n");
    onDraft({
      kind: "comment",
      target: {
        type: "source",
        file: active.path,
        lineStart: start,
        lineEnd: end,
        code: lines.slice(start - 1, end).join("\n").slice(0, 6000),
      },
      anchor: selection.anchor,
    });
    clear();
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-card">
      {files.length > 1 && (
        <nav aria-label="Source files" className="w-52 shrink-0 overflow-y-auto overscroll-contain border-r border-stone-100 py-2">
          {files.map((file) => {
            const count = notes.filter((note) => {
              const target = noteTarget(note);
              return target?.type === "source" && target.file === file.path;
            }).length;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setActivePath(file.path)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11px] text-stone-500 hover:bg-stone-50 hover:text-stone-900",
                  file.path === active.path && "bg-stone-100 text-stone-900",
                )}
                title={file.path}
              >
                <FileCode2 className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                <span className="min-w-0 flex-1 truncate">{file.path}</span>
                {count > 0 && <span className="text-[10px] text-stone-400">{count}</span>}
              </button>
            );
          })}
        </nav>
      )}
      <div ref={code} className="relative min-w-0 flex-1 overflow-auto overscroll-contain">
        <SyntaxHighlighter
          language={languageFor(active.path)}
          style={oneLight}
          showLineNumbers
          wrapLines
          lineProps={(line: number) => {
            const note = notedLines.get(line);
            return {
              "data-line": line,
              style: {
                display: "block",
                background: note
                  ? note.annotationId === focusedNoteId
                    ? "rgba(252, 211, 77, 0.45)"
                    : note.status === "resolved"
                      ? "rgba(214, 211, 209, 0.3)"
                      : "rgba(253, 224, 71, 0.28)"
                  : undefined,
              },
            } as React.HTMLAttributes<HTMLElement>;
          }}
          customStyle={{
            margin: 0,
            minHeight: "100%",
            padding: "16px 16px 120px 0",
            background: "transparent",
            fontSize: "12px",
            lineHeight: "1.7",
          }}
          lineNumberStyle={{ color: "#a8a29e", minWidth: "3.2em", paddingRight: "1em", userSelect: "none" }}
        >
          {active.content}
        </SyntaxHighlighter>
        <SourceNoteMarkers
          container={code}
          notes={fileNotes}
          numberOf={numberOf}
          focusedNoteId={focusedNoteId}
          onOpenNote={onOpenNote}
        />
      </div>
      {selection && <SelectionBubble anchor={selection.anchor} onNote={addNote} />}
    </div>
  );
}

function SourceNoteMarkers({
  container,
  notes,
  numberOf,
  focusedNoteId,
  onOpenNote,
}: {
  container: React.RefObject<HTMLDivElement | null>;
  notes: CanvasAnnotation[];
  numberOf: StageProps["numberOf"];
  focusedNoteId?: string | null;
  onOpenNote: StageProps["onOpenNote"];
}) {
  const [positions, setPositions] = useState<Array<{ note: CanvasAnnotation; top: number }>>([]);
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const base = root.getBoundingClientRect().top - root.scrollTop;
      setPositions(
        notes.flatMap((note) => {
          const target = noteTarget(note);
          if (target?.type !== "source") return [];
          const line = root.querySelector(`[data-line="${target.lineStart}"]`);
          if (!line) return [];
          return [{ note, top: line.getBoundingClientRect().top - base }];
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [container, notes]);
  return (
    <>
      {positions.map(({ note, top }) => (
        <button
          key={note.annotationId}
          type="button"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenNote(note, { x: rect.right + 8, y: rect.top });
          }}
          className={cn(
            "absolute right-3 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white shadow-floating",
            note.status === "resolved" ? "bg-stone-400" : note.annotationId === focusedNoteId ? "bg-amber-500" : "bg-stone-900",
          )}
          style={{ top }}
          aria-label={`Note ${numberOf(note.annotationId)}: ${note.body}`}
        >
          {numberOf(note.annotationId)}
        </button>
      ))}
    </>
  );
}

export function languageFor(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return (
    (
      {
        tsx: "tsx",
        ts: "typescript",
        jsx: "jsx",
        js: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        html: "markup",
        htm: "markup",
        xml: "markup",
        svg: "markup",
        css: "css",
        scss: "scss",
        json: "json",
        md: "markdown",
        py: "python",
        rb: "ruby",
        go: "go",
        rs: "rust",
        java: "java",
        sql: "sql",
        yml: "yaml",
        yaml: "yaml",
        sh: "bash",
        mmd: "markdown",
        mermaid: "markdown",
      } as Record<string, string>
    )[extension] ?? "text"
  );
}
