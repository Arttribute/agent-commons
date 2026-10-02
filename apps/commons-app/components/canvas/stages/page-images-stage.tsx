"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { notePage } from "../canvas-notes";
import {
  NoteMarkers,
  SpatialLayer,
  StageMessage,
  fitInStage,
  useElementSize,
  type StageProps,
} from "./stage-kit";

type PageImage = { url: string; pageNumber: number; width?: number | null; height?: number | null };

/** Rendered page or slide images from the preview pipeline. */
export function pageImages(preview: StageProps["preview"], kind: "pdf_page_image" | "presentation_slide_image") {
  return (preview.artifacts ?? [])
    .filter((artifact) => artifact.kind === kind && artifact.url)
    .map((artifact, index) => ({
      url: artifact.url!,
      pageNumber: artifact.pageNumber ?? index + 1,
      width: artifact.width,
      height: artifact.height,
    }))
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

export function PageImagesStage(props: StageProps & { pageLabel: "page" | "slide" }) {
  const pages = useMemo(
    () => pageImages(props.preview, props.pageLabel === "slide" ? "presentation_slide_image" : "pdf_page_image"),
    [props.pageLabel, props.preview],
  );
  if (!pages.length) {
    return (
      <StageMessage
        title={`This ${props.pageLabel === "slide" ? "deck" : "document"} has no page preview`}
        detail="Download it to view the original."
      />
    );
  }
  return props.pageLabel === "slide" ? <SlideDeck {...props} pages={pages} /> : <PageScroll {...props} pages={pages} />;
}

function PageThumbs({
  pages,
  current,
  label,
  onSelect,
  total,
}: {
  pages: PageImage[];
  current: number;
  label: "page" | "slide";
  total: number;
  onSelect: (page: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector(`[data-thumb="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);
  return (
    <nav
      aria-label={label === "slide" ? "Slides" : "Pages"}
      className="mb-3 ml-3 mt-16 flex w-[168px] shrink-0 flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white/95 shadow-floating"
    >
      <p className="shrink-0 px-3 py-2.5 text-xs text-stone-500">
        {total} {label === "slide" ? (total === 1 ? "slide" : "slides") : total === 1 ? "page" : "pages"}
      </p>
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2.5 pb-3">
        {pages.map((page) => (
          <button
            key={page.pageNumber}
            type="button"
            data-thumb={page.pageNumber}
            onClick={() => onSelect(page.pageNumber)}
            className="flex w-full items-start gap-1.5 text-left"
            aria-current={page.pageNumber === current ? "page" : undefined}
          >
            <span className={cn("w-4 shrink-0 pt-1 text-right text-[10px] tabular-nums", page.pageNumber === current ? "text-stone-900" : "text-stone-400")}>
              {page.pageNumber}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.url}
              alt=""
              loading="lazy"
              className={cn(
                "block w-full flex-1 rounded-[3px] bg-white ring-2 transition",
                page.pageNumber === current ? "ring-stone-900" : "ring-transparent hover:ring-stone-300",
              )}
            />
          </button>
        ))}
      </div>
    </nav>
  );
}

function SlideDeck({
  pages,
  preview,
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
  onPages,
}: StageProps & { pages: PageImage[]; pageLabel: "page" | "slide" }) {
  const [current, setCurrent] = useState(pages[0]?.pageNumber ?? 1);
  const stage = useRef<HTMLDivElement>(null);
  const size = useElementSize(stage);
  const page = pages.find((entry) => entry.pageNumber === current) ?? pages[0];
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(
    page.width && page.height ? { width: page.width, height: page.height } : null,
  );
  const total = typeof preview.metadata?.pages === "number" ? (preview.metadata.pages as number) : pages.length;
  const box = fitInStage(size, natural, 48);

  useEffect(() => onPages?.(pages.length), [onPages, pages.length]);
  useEffect(() => onViewer({ page: current, pageCount: total }), [current, onViewer, total]);
  useEffect(() => {
    const note = notes.find((entry) => entry.annotationId === focusedNoteId);
    const target = note ? notePage(note) : undefined;
    if (target) setCurrent(target);
  }, [focusedNoteId, notes]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (element?.closest("input, textarea, [contenteditable='true']")) return;
      const index = pages.findIndex((entry) => entry.pageNumber === current);
      if (["ArrowRight", "PageDown"].includes(event.key) && index < pages.length - 1) {
        setCurrent(pages[index + 1].pageNumber);
      }
      if (["ArrowLeft", "PageUp"].includes(event.key) && index > 0) {
        setCurrent(pages[index - 1].pageNumber);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, pages]);

  const index = pages.findIndex((entry) => entry.pageNumber === current);
  const slideNotes = notes.filter((note) => notePage(note) === current);

  return (
    <div className="flex h-full min-h-0 w-full">
      {showPages && (
        <PageThumbs pages={pages} current={current} label="slide" total={total} onSelect={setCurrent} />
      )}
      <div ref={stage} className="relative min-w-0 flex-1">
        {box && (
          <div
            className="absolute"
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              transform: `scale(${zoom})`,
              transformOrigin: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.url}
              alt={`${preview.name}, slide ${current}`}
              draggable={false}
              className="absolute inset-0 h-full w-full select-none rounded-[3px] bg-white object-contain shadow-card ring-1 ring-stone-900/5"
            />
            <SpatialLayer
              tool={tool}
              disabled={!canAnnotate}
              onPoint={(point, anchor) =>
                onDraft({ kind: "point", target: { type: "point", page: current, pageLabel: "slide" }, geometry: point, intrinsicSize: natural, anchor })
              }
              onRegion={(region, anchor) =>
                onDraft({ kind: "region", target: { type: "region", page: current, pageLabel: "slide" }, geometry: region, intrinsicSize: natural, anchor })
              }
            />
            <div className="pointer-events-none absolute inset-0 z-20">
              <NoteMarkers notes={slideNotes} numberOf={numberOf} focusedNoteId={focusedNoteId} onOpenNote={onOpenNote} />
            </div>
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={page.url}
          alt=""
          className="hidden"
          onLoad={(event) =>
            setNatural({ width: event.currentTarget.naturalWidth || 16, height: event.currentTarget.naturalHeight || 9 })
          }
        />
        {pages.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[84px] flex justify-center">
            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-stone-200/80 bg-white/95 px-1 py-0.5 text-xs text-stone-600 shadow-floating">
              <button
                type="button"
                aria-label="Previous slide"
                disabled={index <= 0}
                onClick={() => setCurrent(pages[index - 1].pageNumber)}
                className="rounded-full p-1.5 hover:bg-stone-100 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="tabular-nums">
                {current} / {total}
              </span>
              <button
                type="button"
                aria-label="Next slide"
                disabled={index >= pages.length - 1}
                onClick={() => setCurrent(pages[index + 1].pageNumber)}
                className="rounded-full p-1.5 hover:bg-stone-100 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PageScroll({
  pages,
  preview,
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
  onPages,
}: StageProps & { pages: PageImage[]; pageLabel: "page" | "slide" }) {
  const scroller = useRef<HTMLDivElement>(null);
  const size = useElementSize(scroller);
  const [current, setCurrent] = useState(1);
  const width = Math.max(240, Math.min(size.width - 48, 920)) * zoom;
  const total = typeof preview.metadata?.pages === "number" ? (preview.metadata.pages as number) : pages.length;

  useEffect(() => onPages?.(pages.length), [onPages, pages.length]);
  useEffect(() => onViewer({ page: current, pageCount: total }), [current, onViewer, total]);
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const page = Number((visible?.target as HTMLElement | undefined)?.dataset.page);
        if (page) setCurrent(page);
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );
    root.querySelectorAll("[data-page]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pages, width]);
  useEffect(() => {
    const note = notes.find((entry) => entry.annotationId === focusedNoteId);
    const page = note ? notePage(note) : undefined;
    if (page) scroller.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedNoteId, notes]);

  return (
    <div className="flex h-full min-h-0 w-full">
      {showPages && (
        <PageThumbs
          pages={pages}
          current={current}
          label="page"
          total={total}
          onSelect={(page) => scroller.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      )}
      <div ref={scroller} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
        <div className="mx-auto flex w-max flex-col items-center gap-5 px-6 pb-40 pt-16">
          {pages.map((page) => {
            const ratio = page.width && page.height ? page.height / page.width : 1.294;
            const pageNotes = notes.filter((note) => notePage(note) === page.pageNumber);
            const intrinsic = page.width && page.height ? { width: page.width, height: page.height } : null;
            return (
              <div key={page.pageNumber} data-page={page.pageNumber} className="relative" style={{ width, height: width * ratio }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.url}
                  alt={`${preview.name}, page ${page.pageNumber}`}
                  loading="lazy"
                  draggable={false}
                  className="absolute inset-0 h-full w-full select-none rounded-[2px] bg-white object-contain shadow-card ring-1 ring-stone-900/5"
                />
                <SpatialLayer
                  tool={tool}
                  disabled={!canAnnotate}
                  onPoint={(point, anchor) =>
                    onDraft({ kind: "point", target: { type: "point", page: page.pageNumber, pageLabel: "page" }, geometry: point, intrinsicSize: intrinsic, anchor })
                  }
                  onRegion={(region, anchor) =>
                    onDraft({ kind: "region", target: { type: "region", page: page.pageNumber, pageLabel: "page" }, geometry: region, intrinsicSize: intrinsic, anchor })
                  }
                />
                <div className="pointer-events-none absolute inset-0 z-20">
                  <NoteMarkers notes={pageNotes} numberOf={numberOf} focusedNoteId={focusedNoteId} onOpenNote={onOpenNote} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
