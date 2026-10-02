"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CanvasAnnotation } from "@/lib/canvas";
import { artifactKind, isMermaid } from "@/lib/artifacts";
import { MermaidDiagram, isMermaidFence } from "@/components/artifacts/mermaid-diagram";
import { cn } from "@/lib/utils";
import { noteTarget, notePage, type InspectedElement } from "../canvas-notes";
import {
  clearHighlight,
  linesFor,
  paintHighlight,
  quoteForRange,
  rangeForQuote,
} from "../text-anchor";
import { SourceView } from "./source-view";
import {
  NoteMarkers,
  SelectionBubble,
  SpatialLayer,
  StageMessage,
  useSelectionBubble,
  type StageProps,
} from "./stage-kit";

export const MARKDOWN = /\.(md|markdown|mdx)$/i;

/** Stable overrides: inline ones would remount diagrams on every render. */
const MARKDOWN_COMPONENTS: Components = {
  pre({ children, ...rest }) {
    // Diagrams render on their own, not inside a code box.
    const child = Array.isArray(children) ? children[0] : children;
    const className = (child as { props?: { className?: string } } | undefined)?.props?.className;
    return isMermaidFence(className) ? <>{children}</> : <pre {...rest}>{children}</pre>;
  },
  code({ className, children, ...rest }) {
    if (isMermaidFence(className)) {
      return <MermaidDiagram source={String(children)} className="not-prose my-4 flex justify-center" />;
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
};

export function TextStage(props: StageProps) {
  const { preview, view } = props;
  const text = preview.content ?? preview.textPreview ?? "";
  if (isMermaid(preview)) {
    return view === "source" ? (
      <div className="h-full w-full px-6 pb-28 pt-16">
        <SourceView {...props} files={[{ path: preview.name, content: text }]} />
      </div>
    ) : (
      <MermaidStage {...props} source={text} />
    );
  }
  if (!text.trim()) {
    return <StageMessage title="No text preview is available" detail="Download the file to view the original." />;
  }
  const kind = artifactKind(preview);
  if (MARKDOWN.test(preview.name)) return <Article {...props} text={text} markdown />;
  if (kind === "code") {
    return (
      <div className="h-full w-full px-6 pb-28 pt-16">
        <SourceView {...props} files={[{ path: preview.name, content: text }]} />
      </div>
    );
  }
  if (kind === "presentation") return <SlideText {...props} text={text} />;
  return <Article {...props} text={text} markdown={MARKDOWN.test(preview.name)} />;
}

/** Paint text-note highlights inside `root` and report where they sit. */
function useTextHighlights(
  root: React.RefObject<HTMLElement | null>,
  notes: CanvasAnnotation[],
  focusedNoteId: string | null | undefined,
  ready: boolean,
  scope?: (note: CanvasAnnotation) => Element | null,
) {
  const [placed, setPlaced] = useState<Array<{ note: CanvasAnnotation; range: Range }>>([]);
  const measure = useCallback(() => {
    const element = root.current;
    if (!element || !ready) return;
    const next: Array<{ note: CanvasAnnotation; range: Range }> = [];
    for (const note of notes) {
      const target = noteTarget(note);
      if (target?.type !== "text") continue;
      const container = scope?.(note) ?? element;
      const range = container ? rangeForQuote(container, target) : null;
      if (range) next.push({ note, range });
    }
    setPlaced(next);
    paintHighlight(
      "canvas-note",
      next.filter(({ note }) => note.status !== "resolved" && note.annotationId !== focusedNoteId).map(({ range }) => range),
    );
    paintHighlight(
      "canvas-note-resolved",
      next.filter(({ note }) => note.status === "resolved" && note.annotationId !== focusedNoteId).map(({ range }) => range),
    );
    paintHighlight(
      "canvas-note-focus",
      next.filter(({ note }) => note.annotationId === focusedNoteId).map(({ range }) => range),
    );
  }, [focusedNoteId, notes, ready, root, scope]);

  useEffect(() => {
    measure();
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, root]);

  useEffect(
    () => () => {
      clearHighlight("canvas-note");
      clearHighlight("canvas-note-resolved");
      clearHighlight("canvas-note-focus");
    },
    [],
  );

  // Scroll a focused text note into view.
  useEffect(() => {
    const entry = placed.find(({ note }) => note.annotationId === focusedNoteId);
    entry?.range.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusedNoteId, placed]);

  return placed;
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function MarginMarkers({
  placed,
  frame,
  numberOf,
  focusedNoteId,
  onOpenNote,
}: {
  placed: Array<{ note: CanvasAnnotation; range: Range }>;
  frame: React.RefObject<HTMLElement | null>;
  numberOf: StageProps["numberOf"];
  focusedNoteId?: string | null;
  onOpenNote: StageProps["onOpenNote"];
}) {
  const box = frame.current?.getBoundingClientRect();
  if (!box) return null;
  return (
    <>
      {placed.map(({ note, range }) => {
        const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
        return (
          <button
            key={note.annotationId}
            type="button"
            data-anchor-ignore
            onClick={(event) => {
              const own = event.currentTarget.getBoundingClientRect();
              onOpenNote(note, { x: own.right + 8, y: own.top });
            }}
            className={cn(
              "absolute -right-9 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white shadow-floating",
              note.status === "resolved" ? "bg-stone-400" : note.annotationId === focusedNoteId ? "bg-amber-500" : "bg-stone-900",
            )}
            style={{ top: rect.top - box.top }}
            aria-label={`Note ${numberOf(note.annotationId)}: ${note.body}`}
          >
            {numberOf(note.annotationId)}
          </button>
        );
      })}
    </>
  );
}

function Article({
  text,
  markdown,
  notes,
  numberOf,
  focusedNoteId,
  zoom,
  canAnnotate,
  tool,
  onDraft,
  onOpenNote,
  onViewer,
}: StageProps & { text: string; markdown: boolean }) {
  const article = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const { selection, clear } = useSelectionBubble(article, canAnnotate && tool === "interact");
  const textNotes = useMemo(() => notes.filter((note) => noteTarget(note)?.type === "text"), [notes]);
  const placed = useTextHighlights(article, textNotes, focusedNoteId, ready);
  const [, rerender] = useState(0);

  useEffect(() => {
    setReady(true);
    onViewer({ view: "preview" });
    const id = window.setTimeout(() => rerender((value) => value + 1), 400);
    return () => window.clearTimeout(id);
  }, [onViewer, text]);

  const addNote = () => {
    if (!selection || !article.current) return;
    const quote = quoteForRange(article.current, selection.range);
    if (!quote) return;
    const lines = markdown ? undefined : linesFor(text, quote.start, quote.end);
    onDraft({
      kind: "comment",
      target: {
        type: "text",
        quote: quote.quote,
        prefix: quote.prefix,
        suffix: quote.suffix,
        start: quote.start,
        end: quote.end,
        lineStart: lines?.lineStart,
        lineEnd: lines?.lineEnd,
      },
      anchor: selection.anchor,
    });
    clear();
  };

  return (
    <div className="h-full w-full overflow-auto overscroll-contain px-6 pb-40 pt-16">
      <div
        className="relative mx-auto w-full max-w-3xl origin-top"
        style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined }}
      >
        <article
          ref={article}
          onClick={(event) => {
            if (!window.getSelection()?.isCollapsed) return;
            const caret = caretAt(event.clientX, event.clientY);
            if (!caret) return;
            const hit = placed.find(({ range }) => {
              try {
                return range.isPointInRange(caret.node, caret.offset);
              } catch {
                return false;
              }
            });
            if (hit) onOpenNote(hit.note, { x: event.clientX + 8, y: event.clientY + 8 });
          }}
          className={cn(
            "min-h-[60vh] rounded-[3px] bg-white px-10 py-12 shadow-card ring-1 ring-stone-900/5 sm:px-14",
            markdown
              ? "prose prose-stone max-w-none prose-headings:font-medium prose-pre:bg-stone-50 prose-pre:text-stone-800"
              : "whitespace-pre-wrap break-words text-[15px] leading-7 text-stone-800",
          )}
        >
          {markdown ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={MARKDOWN_COMPONENTS}
            >
              {text}
            </ReactMarkdown>
          ) : (
            text
          )}
        </article>
        <MarginMarkers
          placed={placed}
          frame={article}
          numberOf={numberOf}
          focusedNoteId={focusedNoteId}
          onOpenNote={onOpenNote}
        />
      </div>
      {selection && <SelectionBubble anchor={selection.anchor} onNote={addNote} />}
    </div>
  );
}

function SlideText({
  text,
  notes,
  numberOf,
  focusedNoteId,
  canAnnotate,
  tool,
  onDraft,
  onOpenNote,
  onViewer,
}: StageProps & { text: string }) {
  const slides = useMemo(
    () => text.split(/--- Slide(?: content)? \d+ ---/g).map((slide) => slide.trim()).filter(Boolean),
    [text],
  );
  const root = useRef<HTMLDivElement>(null);
  const { selection, clear } = useSelectionBubble(root, canAnnotate && tool === "interact");
  const scope = useCallback(
    (note: CanvasAnnotation) => root.current?.querySelector(`[data-slide="${notePage(note)}"] .slide-text`) ?? null,
    [],
  );
  const placed = useTextHighlights(root, notes, focusedNoteId, slides.length > 0, scope);
  useEffect(() => onViewer({ pageCount: slides.length }), [onViewer, slides.length]);

  const addNote = () => {
    if (!selection) return;
    const slide = (selection.range.startContainer.parentElement ?? null)?.closest<HTMLElement>("[data-slide]");
    const body = slide?.querySelector(".slide-text");
    if (!slide || !body) return;
    const quote = quoteForRange(body, selection.range);
    if (!quote) return;
    onDraft({
      kind: "comment",
      target: {
        type: "text",
        page: Number(slide.dataset.slide),
        pageLabel: "slide",
        quote: quote.quote,
        prefix: quote.prefix,
        suffix: quote.suffix,
        start: quote.start,
        end: quote.end,
      },
      anchor: selection.anchor,
    });
    clear();
  };

  return (
    <div className="h-full w-full overflow-auto overscroll-contain px-6 pb-40 pt-16">
      <div ref={root} className="mx-auto max-w-3xl space-y-5">
        {slides.map((slide, index) => {
          const lines = slide.split("\n").map((line) => line.trim()).filter(Boolean);
          return (
            <section
              key={index}
              data-slide={index + 1}
              className="relative aspect-video overflow-hidden rounded-[3px] bg-white p-[6%] shadow-card ring-1 ring-stone-900/5"
            >
              <span className="absolute left-3 top-2 text-[10px] text-stone-400" data-anchor-ignore>
                {index + 1}
              </span>
              <div className="slide-text">
                {lines[0] && <h2 className="text-xl font-medium text-stone-900">{lines[0]}</h2>}
                {lines.slice(1).map((line, lineIndex) => (
                  <p key={lineIndex} className="mt-2 text-sm leading-6 text-stone-600">
                    {line}
                  </p>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {placed.map(({ note, range }) => {
        const rect = range.getBoundingClientRect();
        return (
          <button
            key={note.annotationId}
            type="button"
            onClick={() => onOpenNote(note, { x: rect.right + 8, y: rect.top })}
            className="fixed z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-900 px-1 text-[10px] font-medium text-white shadow-floating"
            style={{ left: rect.right + 4, top: rect.top - 10 }}
            aria-label={`Note ${numberOf(note.annotationId)}: ${note.body}`}
          >
            {numberOf(note.annotationId)}
          </button>
        );
      })}
      {selection && <SelectionBubble anchor={selection.anchor} onNote={addNote} />}
    </div>
  );
}

/** A Mermaid diagram with notes pinned to nodes or regions. */
function MermaidStage({
  source,
  tool,
  notes,
  numberOf,
  focusedNoteId,
  zoom,
  canAnnotate,
  onDraft,
  onOpenNote,
  onViewer,
}: StageProps & { source: string }) {
  const diagram = useRef<HTMLDivElement>(null);
  useEffect(() => onViewer({ view: "preview" }), [onViewer]);

  const nodeAt = (x: number, y: number): InspectedElement[] => {
    const stack = document.elementsFromPoint(x, y);
    const svg = diagram.current?.querySelector("svg");
    const hit = stack.find((element) => svg?.contains(element));
    const node = hit?.closest(".node, .cluster, .edgeLabel, .actor, .note, .task, [id^='flowchart-'], [id^='state-'], [id^='classId-'], [id^='entity-']");
    if (!node) return [];
    const label = (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    const rawId = node.getAttribute("id") ?? "";
    const key = rawId.replace(/^(flowchart|state|classId|entity)-/, "").replace(/-\d+$/, "");
    const lines = source.split("\n");
    const lineIndex = key
      ? lines.findIndex((line) => new RegExp(`(^|[^\\w])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w]|$)`).test(line))
      : lines.findIndex((line) => label && line.includes(label));
    return [
      {
        selector: rawId ? `#${rawId}` : undefined,
        tag: "diagram node",
        text: label || undefined,
        source: lineIndex >= 0 ? `line ${lineIndex + 1}: ${lines[lineIndex].trim()}` : undefined,
      },
    ];
  };

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto overscroll-contain px-6 pb-32 pt-16">
      <div
        className="relative rounded-2xl bg-white p-8 shadow-card ring-1 ring-stone-900/5"
        style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined }}
      >
        <MermaidDiagram ref={diagram} source={source} className="flex min-w-[320px] justify-center" />
        <SpatialLayer
          tool={tool}
          disabled={!canAnnotate}
          onPoint={(point, anchor) => {
            const elements = nodeAt(anchor.x - 12, anchor.y + 12);
            onDraft(
              elements.length
                ? { kind: "point", target: { type: "element", elements }, geometry: point, anchor }
                : { kind: "point", target: { type: "point" }, geometry: point, anchor },
            );
          }}
          onRegion={(region, anchor) => onDraft({ kind: "region", target: { type: "region" }, geometry: region, anchor })}
        />
        <div className="pointer-events-none absolute inset-0 z-20">
          <NoteMarkers notes={notes} numberOf={numberOf} focusedNoteId={focusedNoteId} onOpenNote={onOpenNote} />
        </div>
      </div>
    </div>
  );
}
