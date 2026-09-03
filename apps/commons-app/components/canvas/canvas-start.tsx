"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  LibraryBig,
  Loader2,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";
import {
  LibraryPickerDialog,
  type LibraryPickerItem,
} from "@/components/sessions/chat/library-picker-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  type MediaCatalog,
  type MediaJob,
  type MediaModel,
  type MediaQuote,
  unwrapCanvasPayload,
} from "@/lib/canvas";
import { ModelSelector } from "./canvas-studio";

export function CanvasStart() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [catalog, setCatalog] = useState<MediaCatalog | null>(null);
  const [model, setModel] = useState<MediaModel | undefined>();
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [quote, setQuote] = useState<MediaQuote | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/canvas/models", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "Could not load models");
        return unwrapCanvasPayload<MediaCatalog>(payload);
      })
      .then((next) => {
        setCatalog(next);
        const initial =
          next.models.find(
            (entry) =>
              entry.kind === "image" &&
              entry.available &&
              !entry.badges?.some((badge) => badge.toLowerCase().includes("retire")),
          ) ?? next.models.find((entry) => entry.available);
        if (initial) selectModel(initial);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Canvas unavailable"));
  }, []);

  function selectModel(next: MediaModel) {
    setModel(next);
    setSettings(
      Object.fromEntries(
        next.settings
          .filter((field) => field.default !== undefined)
          .map((field) => [field.key, field.default]),
      ),
    );
  }

  useEffect(() => {
    if (!model || !prompt.trim()) {
      setQuote(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/canvas/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          modelKey: model.modelKey,
          provider: model.provider,
          operation: "generate",
          prompt: prompt.trim(),
          inputItemIds: [],
          settings,
        }),
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error();
          setQuote(unwrapCanvasPayload<MediaQuote>(payload));
        })
        .catch(() => {
          if (!controller.signal.aborted) setQuote(null);
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [model, prompt, settings]);

  async function upload(files: FileList | File[]) {
    const selected = Array.from(files).filter((file) => file.size > 0);
    if (!selected.length) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      selected.forEach((file) => body.append("files", file));
      const response = await fetch("/api/files/upload", { method: "POST", body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || payload?.error || "Upload failed");
      const uploaded = Array.isArray(payload?.data) ? payload.data[0] : null;
      const item = uploaded
        ? ({ ...uploaded, itemId: uploaded.itemId ?? uploaded.fileId } as LibraryPickerItem)
        : null;
      if (!item?.itemId) throw new Error("Upload returned no Library item");
      router.push(`/studio/canvas/${encodeURIComponent(item.itemId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
      setBusy(false);
    }
  }

  async function generate() {
    if (!model?.available || !prompt.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/canvas/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: model.provider,
          modelKey: model.modelKey,
          operation: "generate",
          prompt: prompt.trim(),
          inputItemIds: [],
          settings,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Could not start generation");
      let job = unwrapCanvasPayload<MediaJob>(payload);
      while (["queued", "running"].includes(job.status)) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_200));
        const poll = await fetch(`/api/canvas/generations/${encodeURIComponent(job.jobId)}`, { cache: "no-store" });
        const next = await poll.json().catch(() => null);
        if (!poll.ok) throw new Error(next?.message || "Generation failed");
        job = unwrapCanvasPayload<MediaJob>(next);
      }
      if (job.status !== "completed" || !job.outputItemId) {
        throw new Error(job.errorMessage || "Generation did not complete");
      }
      router.push(`/studio/canvas/${encodeURIComponent(job.outputItemId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generation failed");
      setBusy(false);
    }
  }

  const creditLabel = useMemo(
    () => (quote ? `Up to ${quote.estimatedCredits} credits` : "Quoted before generation"),
    [quote],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f3f2ef] text-stone-900">
      <header className="flex h-14 items-center border-b border-stone-200 bg-white px-3">
        <Button asChild variant="ghost" size="icon"><Link href="/library" aria-label="Back to Library"><ChevronLeft className="h-4 w-4" /></Link></Button>
        <span className="ml-2 text-sm font-semibold">New Canvas project</span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-10">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-sm"><WandSparkles className="h-5 w-5" /></span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Create or open media</h1>
            <p className="mt-2 text-sm text-stone-500">Start with a file, something in your Library, or a generated artifact.</p>
          </div>

          <div
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}
            className={`mt-8 rounded-2xl border border-dashed bg-white p-8 text-center transition ${dragging ? "border-stone-900 ring-4 ring-stone-200" : "border-stone-300"}`}
          >
            <Upload className="mx-auto h-6 w-6 text-stone-400" />
            <p className="mt-3 text-sm font-semibold">Drop media here</p>
            <p className="mt-1 text-xs text-stone-400">Images, video, audio, PDFs, and documents</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" /> Upload file</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setPickerOpen(true)} className="gap-2"><LibraryBig className="h-4 w-4" /> Open Library</Button>
            </div>
          </div>

          <div className="my-6 flex items-center gap-4 text-[10px] uppercase tracking-[0.16em] text-stone-400"><span className="h-px flex-1 bg-stone-200" />or generate<span className="h-px flex-1 bg-stone-200" /></div>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="grid gap-5 md:grid-cols-[300px_1fr]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Model</p>
                <ModelSelector catalog={catalog} selected={model} onSelect={selectModel} />
                <p className="mt-3 text-[10px] leading-4 text-stone-400">{creditLabel}. The estimate is reserved first; final provider usage settles the charge and releases the remainder.</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Prompt</p>
                <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe what you want to create…" className="mt-1.5 min-h-24 resize-none" />
                <Button type="button" onClick={() => void generate()} disabled={busy || !model?.available || !prompt.trim()} className="mt-3 w-full gap-2 bg-stone-900 text-white">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {busy ? "Creating…" : "Generate and open in Canvas"}
                </Button>
              </div>
            </div>
          </section>
          {error ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
        </div>
      </main>
      <input ref={inputRef} type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt,.md,.doc,.docx" onChange={(event) => void upload(event.target.files ?? [])} />
      <LibraryPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} attachedFileIds={[]} onAdd={(items) => {
        const item = items[0];
        if (item) router.push(`/studio/canvas/${encodeURIComponent(item.itemId)}`);
      }} />
    </div>
  );
}
