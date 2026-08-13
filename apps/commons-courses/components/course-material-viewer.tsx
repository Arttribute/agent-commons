"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Expand, FileText, LoaderCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type MaterialData = { id: string; name: string; mimeType: string; kind: "presentation" | "pdf"; content: string; imageUrls: string[]; downloadUrl?: string };

export function CourseMaterialViewer({ materialId, compact = false }: { materialId: string; compact?: boolean }) {
  const [material, setMaterial] = useState<MaterialData | null>(null);
  const [error, setError] = useState("");
  const [slide, setSlide] = useState(0);
  const [full, setFull] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/course-materials/${materialId}`, { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (ok) setMaterial(body.material);
        else setError(body.error || "Could not open this material.");
      })
      .catch(() => { if (!cancelled) setError("Could not open this material."); });
    return () => { cancelled = true; };
  }, [materialId]);
  const slides = useMemo(() => splitSlides(material?.content || ""), [material?.content]);
  if (error) return <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{error}</div>;
  if (!material) return <div className="flex min-h-48 items-center justify-center rounded-xl bg-slate-50"><LoaderCircle className="h-5 w-5 animate-spin text-slate-300" /></div>;
  const stage = material.kind === "pdf" && material.downloadUrl ? (
    <iframe title={material.name} src={`${material.downloadUrl}#toolbar=0&view=FitH`} className={cn("w-full border-0 bg-slate-100", full ? "h-[calc(100dvh-64px)]" : compact ? "h-[58vh]" : "h-[72vh]")} />
  ) : material.kind === "presentation" && material.downloadUrl ? (
    <iframe title={material.name} src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(material.downloadUrl)}`} className={cn("w-full border-0 bg-slate-950", full ? "h-[calc(100dvh-64px)]" : compact ? "h-[58vh]" : "h-[72vh]")} allowFullScreen />
  ) : material.imageUrls.length ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={material.imageUrls[Math.min(slide, material.imageUrls.length - 1)]} alt={`Slide ${slide + 1}`} className="mx-auto max-h-[72vh] w-full object-contain" />
  ) : (
    <div className={cn("flex min-h-[420px] items-center justify-center bg-slate-950 p-8 text-white sm:p-14", full && "min-h-[calc(100dvh-64px)]")}><div className="w-full max-w-5xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Slide {slide + 1} of {Math.max(slides.length, 1)}</p><div className="mt-7 whitespace-pre-wrap text-2xl font-semibold leading-relaxed sm:text-4xl sm:leading-snug">{slides[slide] || material.name}</div></div></div>
  );
  return <div className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-white", full && "fixed inset-0 z-[100] rounded-none border-0 bg-slate-950")}>
    <div className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4"><FileText className="h-4 w-4 text-slate-400" /><p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{material.name}</p>{material.downloadUrl ? <a href={material.downloadUrl} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Download original"><Download className="h-4 w-4" /></a> : null}<button onClick={() => setFull(!full)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title={full ? "Exit presentation" : "Present full screen"}>{full ? <X className="h-4 w-4" /> : <Expand className="h-4 w-4" />}</button></div>
    {stage}
    {material.kind === "presentation" && !material.downloadUrl ? <div className="flex h-14 items-center justify-between border-t border-slate-800 bg-slate-950 px-4 text-white"><button disabled={slide <= 0} onClick={() => setSlide((value) => Math.max(0, value - 1))} className="inline-flex items-center gap-2 text-xs font-bold disabled:opacity-30"><ChevronLeft className="h-4 w-4" /> Previous</button><span className="text-xs text-slate-400">{slide + 1} / {Math.max(slides.length, material.imageUrls.length, 1)}</span><button disabled={slide >= Math.max(slides.length, material.imageUrls.length, 1) - 1} onClick={() => setSlide((value) => value + 1)} className="inline-flex items-center gap-2 text-xs font-bold disabled:opacity-30">Next <ChevronRight className="h-4 w-4" /></button></div> : null}
  </div>;
}

function splitSlides(content: string) {
  const matches = content.split(/--- Slide \d+ ---/i).map((value) => value.trim()).filter(Boolean);
  return matches.length ? matches : content ? [content] : [];
}
