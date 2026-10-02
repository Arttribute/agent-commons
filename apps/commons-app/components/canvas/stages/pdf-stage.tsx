"use client";

import "pdfjs-dist/web/pdf_viewer.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { CanvasAnnotation } from "@/lib/canvas";
import { cn } from "@/lib/utils";
import { FileTypeMark } from "../canvas-chrome";
import { noteGeometry, noteTarget, notePage } from "../canvas-notes";
import { boundingRect, quoteForRange, rangeRects } from "../text-anchor";
import {
  NoteMarkers,
  SelectionBubble,
  SpatialLayer,
  StageMessage,
  useElementSize,
  useSelectionBubble,
  type StageProps,
} from "./stage-kit";
import { PageImagesStage } from "./page-images-stage";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * pdf.js ships its own prebuilt bundle; webpack re-bundling it breaks its
 * module runtime, so the browser build is served from public/vendor/pdfjs
 * (copied by scripts/copy-pdfjs.mjs) and imported as-is.
 */
function loadPdfJs() {
  pdfjsPromise ??= import(/* webpackIgnore: true */ "/vendor/pdfjs/pdf.min.mjs" as string).then(
    (pdfjs: PdfJs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
      return pdfjs;
    },
  );
  return pdfjsPromise;
}

/** PDF bytes from the same origin (or a Local data URL). */
async function loadBytes(preview: StageProps["preview"]) {
  const inline = preview.inline?.url || preview.download?.url;
  if (inline?.startsWith("data:")) {
    return new Uint8Array(await (await fetch(inline)).arrayBuffer());
  }
  const response = await fetch(`/api/library-file/${encodeURIComponent(preview.itemId)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("The PDF could not be loaded");
  return new Uint8Array(await response.arrayBuffer());
}

export function PdfStage(props: StageProps) {
  const { preview, onPages } = props;
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfjs, setPdfjs] = useState<PdfJs | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setDoc(null);
    setFailed(false);
    Promise.all([loadPdfJs(), loadBytes(preview)])
      .then(async ([library, bytes]) => {
        const document = await library.getDocument({ data: bytes }).promise;
        loaded = document;
        if (cancelled) {
          void document.destroy();
          return;
        }
        setPdfjs(library);
        setDoc(document);
        onPages?.(document.numPages);
      })
      .catch((error) => {
        console.warn("PDF viewer fell back to page images", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.itemId, preview.updatedAt]);

  if (failed) return <PageImagesStage {...props} pageLabel="page" />;
  if (!doc || !pdfjs) {
    return (
      <div className="flex h-full items-center justify-center">
        <FileTypeMark artifact={preview} />
      </div>
    );
  }
  return <PdfDocument {...props} doc={doc} pdfjs={pdfjs} />;
}

function PdfDocument({
  doc,
  pdfjs,
  tool,
  notes,
  numberOf,
  focusedNoteId,
  zoom,
  showPages,
  canAnnotate,
  onDraft,
  onOpenNote,
  onViewer,
}: StageProps & { doc: PDFDocumentProxy; pdfjs: PdfJs }) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const size = useElementSize(scroller);
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [current, setCurrent] = useState(1);
  const { selection, clear } = useSelectionBubble(content, canAnnotate && tool === "interact");

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      Array.from({ length: doc.numPages }, (_, index) =>
        doc.getPage(index + 1).then((page) => {
          const viewport = page.getViewport({ scale: 1 });
          return { width: viewport.width, height: viewport.height };
        }),
      ),
    ).then((sizes) => {
      if (!cancelled) setPageSizes(sizes);
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const pageWidth = Math.max(240, Math.min(size.width - 48, 920)) * zoom;

  // Track the page in view for the viewer state and the pages rail.
  useEffect(() => {
    const root = scroller.current;
    if (!root || !pageSizes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const page = Number((visible?.target as HTMLElement | undefined)?.dataset.page);
        if (page) setCurrent(page);
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );
    root.querySelectorAll("[data-page]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pageSizes, pageWidth]);

  useEffect(() => {
    onViewer({ page: current, pageCount: doc.numPages });
  }, [current, doc.numPages, onViewer]);

  // Bring a focused note's page into view.
  useEffect(() => {
    const note = notes.find((entry) => entry.annotationId === focusedNoteId);
    const page = note ? notePage(note) : undefined;
    if (!page) return;
    scroller.current
      ?.querySelector(`[data-page="${page}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedNoteId, notes]);

  const goTo = useCallback((page: number) => {
    scroller.current
      ?.querySelector(`[data-page="${page}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const addTextNote = () => {
    if (!selection) return;
    const range = selection.range;
    const pageElement = (range.startContainer.parentElement ?? null)?.closest<HTMLElement>("[data-page]");
    const layer = pageElement?.querySelector<HTMLElement>(".textLayer");
    if (!pageElement || !layer) return;
    // Keep a selection on its starting page.
    if (!layer.contains(range.endContainer)) range.setEnd(layer, layer.childNodes.length);
    const quote = quoteForRange(layer, range);
    if (!quote) return;
    const rects = rangeRects(range, pageElement.querySelector(".pdf-page-frame") ?? pageElement);
    const geometry = boundingRect(rects);
    if (!geometry) return;
    const page = Number(pageElement.dataset.page);
    onDraft({
      kind: "region",
      target: {
        type: "text",
        page,
        pageLabel: "page",
        quote: quote.quote,
        prefix: quote.prefix,
        suffix: quote.suffix,
        start: quote.start,
        end: quote.end,
        rects,
      },
      geometry,
      anchor: selection.anchor,
    });
    clear();
  };

  return (
    <div className="flex h-full min-h-0 w-full">
      {showPages && (
        <PdfThumbnails doc={doc} pdfjs={pdfjs} current={current} onSelect={goTo} />
      )}
      <div
        ref={scroller}
        className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain"
      >
        <div ref={content} className="mx-auto flex w-max flex-col items-center gap-5 px-6 pb-40 pt-16">
          {pageSizes.map((pageSize, index) => {
            const pageNumber = index + 1;
            const height = (pageSize.height / pageSize.width) * pageWidth;
            const pageNotes = notes.filter((note) => notePage(note) === pageNumber);
            return (
              <div
                key={pageNumber}
                data-page={pageNumber}
                className="relative"
                style={{ width: pageWidth, height }}
              >
                <PdfPage
                  doc={doc}
                  pdfjs={pdfjs}
                  pageNumber={pageNumber}
                  width={pageWidth}
                  height={height}
                  root={scroller}
                />
                <TextHighlights
                  notes={pageNotes}
                  focusedNoteId={focusedNoteId}
                  numberOf={numberOf}
                  onOpenNote={onOpenNote}
                />
                <SpatialLayer
                  tool={tool}
                  disabled={!canAnnotate}
                  onPoint={(point, anchor) =>
                    onDraft({
                      kind: "point",
                      target: { type: "point", page: pageNumber, pageLabel: "page" },
                      geometry: point,
                      intrinsicSize: pageSize,
                      anchor,
                    })
                  }
                  onRegion={(region, anchor) =>
                    onDraft({
                      kind: "region",
                      target: {
                        type: "region",
                        page: pageNumber,
                        pageLabel: "page",
                        quote: textInside(
                          scroller.current?.querySelector(`[data-page="${pageNumber}"]`) ?? null,
                          region,
                        ),
                      },
                      geometry: region,
                      intrinsicSize: pageSize,
                      anchor,
                    })
                  }
                />
                <div className="pointer-events-none absolute inset-0 z-20">
                  <NoteMarkers
                    notes={pageNotes}
                    numberOf={numberOf}
                    focusedNoteId={focusedNoteId}
                    onOpenNote={onOpenNote}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selection && <SelectionBubble anchor={selection.anchor} onNote={addTextNote} />}
    </div>
  );
}

/** Text from the text layer that falls inside a normalized region. */
function textInside(
  pageElement: Element | null,
  region: { x: number; y: number; width: number; height: number },
) {
  const frame = pageElement?.querySelector(".pdf-page-frame");
  if (!frame) return undefined;
  const box = frame.getBoundingClientRect();
  const words: string[] = [];
  frame.querySelectorAll(".textLayer span").forEach((span) => {
    const rect = span.getBoundingClientRect();
    const cx = (rect.left + rect.width / 2 - box.left) / box.width;
    const cy = (rect.top + rect.height / 2 - box.top) / box.height;
    if (
      cx >= region.x &&
      cx <= region.x + region.width &&
      cy >= region.y &&
      cy <= region.y + region.height &&
      span.textContent?.trim()
    ) {
      words.push(span.textContent);
    }
  });
  const text = words.join(" ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 4000) : undefined;
}

function PdfPage({
  doc,
  pdfjs,
  pageNumber,
  width,
  height,
  root,
}: {
  doc: PDFDocumentProxy;
  pdfjs: PdfJs;
  pageNumber: number;
  width: number;
  height: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: root.current, rootMargin: "800px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: ReturnType<PDFPageProxy["render"]> | null = null;
    let layer: InstanceType<PdfJs["TextLayer"]> | null = null;
    void doc.getPage(pageNumber).then(async (page) => {
      if (cancelled || !canvas.current || !textLayer.current || !frame.current) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const target = canvas.current;
      target.width = Math.floor(viewport.width * ratio);
      target.height = Math.floor(viewport.height * ratio);
      target.style.width = `${viewport.width}px`;
      target.style.height = `${viewport.height}px`;
      frame.current.style.setProperty("--total-scale-factor", String(scale));
      frame.current.style.setProperty("--scale-round-x", "1px");
      frame.current.style.setProperty("--scale-round-y", "1px");
      task = page.render({
        canvas: target,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      await task.promise.catch(() => undefined);
      if (cancelled) return;
      textLayer.current.replaceChildren();
      layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayer.current,
        viewport,
      });
      await layer.render().catch(() => undefined);
      if (!cancelled) setRendered(true);
    });
    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
    };
  }, [doc, pageNumber, pdfjs, visible, width]);

  return (
    <div
      ref={frame}
      className="pdf-page-frame absolute inset-0 overflow-hidden rounded-[2px] bg-white shadow-card ring-1 ring-stone-900/5"
      style={{ width, height }}
    >
      <canvas ref={canvas} className={cn("block transition-opacity", rendered ? "opacity-100" : "opacity-0")} />
      <div ref={textLayer} className="textLayer" />
    </div>
  );
}

/** Marker-style boxes over highlighted text, drawn from stored rectangles. */
function TextHighlights({
  notes,
  focusedNoteId,
  numberOf,
  onOpenNote,
}: {
  notes: CanvasAnnotation[];
  focusedNoteId?: string | null;
  numberOf: (id: string) => number;
  onOpenNote: StageProps["onOpenNote"];
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {notes.map((note) => {
        const target = noteTarget(note);
        if (target?.type !== "text") return null;
        const rects = target.rects?.length ? target.rects : [noteGeometry(note)].filter(Boolean);
        const resolved = note.status === "resolved";
        const focused = note.annotationId === focusedNoteId;
        const last = rects.at(-1) as { x: number; y: number; width: number; height: number } | undefined;
        return (
          <span key={note.annotationId}>
            {rects.map((rect, index) => {
              const box = rect as { x: number; y: number; width: number; height: number };
              return (
                <span
                  key={index}
                  onClick={(event) => onOpenNote(note, { x: event.clientX + 8, y: event.clientY + 8 })}
                  className={cn(
                    "pointer-events-auto absolute cursor-pointer rounded-[2px] mix-blend-multiply transition-colors",
                    resolved ? "bg-stone-300/40" : focused ? "bg-amber-300/70" : "bg-yellow-300/50 hover:bg-yellow-300/70",
                  )}
                  style={{
                    left: `${box.x * 100}%`,
                    top: `${box.y * 100}%`,
                    width: `${box.width * 100}%`,
                    height: `${box.height * 100}%`,
                  }}
                />
              );
            })}
            {last && (
              <button
                type="button"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onOpenNote(note, { x: rect.right + 8, y: rect.top });
                }}
                className={cn(
                  "pointer-events-auto absolute flex h-5 min-w-5 -translate-y-1/2 translate-x-1 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white shadow-floating ring-2 ring-white",
                  resolved ? "bg-stone-400" : focused ? "bg-amber-500" : "bg-stone-900",
                )}
                style={{ left: `${(last.x + last.width) * 100}%`, top: `${(last.y + last.height / 2) * 100}%` }}
                aria-label={`Note ${numberOf(note.annotationId)}: ${note.body}`}
              >
                {numberOf(note.annotationId)}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

function PdfThumbnails({
  doc,
  pdfjs,
  current,
  onSelect,
}: {
  doc: PDFDocumentProxy;
  pdfjs: PdfJs;
  current: number;
  onSelect: (page: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const pages = useMemo(() => Array.from({ length: doc.numPages }, (_, index) => index + 1), [doc]);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-thumb="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);
  return (
    <nav
      aria-label="Pages"
      className="ml-3 mt-16 mb-3 flex w-[150px] shrink-0 flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white/95 shadow-floating"
    >
      <p className="shrink-0 px-3 py-2.5 text-xs text-stone-500">
        {doc.numPages} {doc.numPages === 1 ? "page" : "pages"}
      </p>
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2.5 pb-3">
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            data-thumb={page}
            onClick={() => onSelect(page)}
            className="flex w-full items-start gap-1.5 text-left"
            aria-current={page === current ? "page" : undefined}
          >
            <span className={cn("w-4 shrink-0 pt-1 text-right text-[10px] tabular-nums", page === current ? "text-stone-900" : "text-stone-400")}>
              {page}
            </span>
            <span
              className={cn(
                "block flex-1 overflow-hidden rounded-[3px] ring-2 transition",
                page === current ? "ring-stone-900" : "ring-transparent hover:ring-stone-300",
              )}
            >
              <PdfThumbnail doc={doc} pdfjs={pdfjs} pageNumber={page} />
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function PdfThumbnail({
  doc,
  pageNumber,
}: {
  doc: PDFDocumentProxy;
  pdfjs: PdfJs;
  pageNumber: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let task: ReturnType<PDFPageProxy["render"]> | null = null;
    let cancelled = false;
    void doc.getPage(pageNumber).then((page) => {
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 220 / base.width });
      canvas.current.width = viewport.width;
      canvas.current.height = viewport.height;
      task = page.render({ canvas: canvas.current, viewport });
      void task.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, visible]);
  return <canvas ref={canvas} className="block h-auto w-full bg-white" />;
}

export function PdfUnavailable() {
  return <StageMessage title="This PDF could not be shown" detail="Download it to view the original." />;
}
