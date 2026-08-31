"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, LoaderCircle, Presentation, Trash2, Upload } from "lucide-react";
import { CourseMaterialViewer } from "@/components/course-material-viewer";
import type { CourseMaterialRecord } from "@/types/course-material";

export function CourseMaterialLibrary({ slug }: { slug: string }) {
  const [materials, setMaterials] = useState<CourseMaterialRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [visibility, setVisibility] = useState<CourseMaterialRecord["visibility"]>("course");
  const inputRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/educator/courses/${slug}/materials`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setMaterials(body.materials || []);
    else setNotice(body.error || "Could not load materials.");
  }, [slug]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setNotice("");
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));
    form.append("visibility", visibility);
    const res = await fetch(`/api/educator/courses/${slug}/materials`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setMaterials((current) => [...(body.materials || []), ...current]);
      setNotice(
        visibility === "live"
          ? "Uploaded as live-attendee-only material and added to your Commons Library."
          : visibility === "educator"
            ? "Uploaded for facilitators only and added to your Commons Library."
            : "Uploaded privately to this course and added to your Commons Library.",
      );
    } else setNotice(body.error || "Could not upload materials.");
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(id: string) {
    const res = await fetch(`/api/educator/course-materials/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setMaterials((current) => current.filter((item) => item.id !== id));
    if (selected === id) setSelected("");
    setNotice("Removed from this course. The original remains in your Commons Library.");
  }

  return <div className="space-y-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Private course library</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Materials</h2><p className="mt-1 text-sm text-slate-500">Store PDFs and PowerPoint decks once, then reuse them in lessons and live sessions.</p></div><div className="flex flex-col gap-2 sm:flex-row"><select value={visibility} onChange={(event) => setVisibility(event.target.value as CourseMaterialRecord["visibility"])} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700"><option value="course">All enrolled learners</option><option value="live">Live attendees only</option><option value="educator">Facilitators only</option></select><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"><input ref={inputRef} type="file" multiple accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" onChange={(event) => void upload(event.target.files)} disabled={uploading} />{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload material</label></div></header>
    {notice ? <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{notice}</div> : null}
    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]"><section className="rounded-2xl border border-slate-200 bg-white p-3"><div className="space-y-1">{materials.map((item) => <div key={item.id} className={`group flex items-center gap-2 rounded-xl ${selected === item.id ? "bg-slate-950 text-white" : "hover:bg-slate-50"}`}><button onClick={() => setSelected(item.id)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected === item.id ? "bg-white/10" : "bg-slate-100"}`}>{item.kind === "pdf" ? <FileText className="h-4 w-4" /> : <Presentation className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{item.name}</span><span className="text-[10px] uppercase tracking-wide text-slate-400">{item.kind === "pdf" ? "PDF" : "PowerPoint"} · {formatSize(item.size)}</span></span></button><button onClick={() => void remove(item.id)} className={`mr-2 rounded-lg p-2 opacity-0 group-hover:opacity-100 ${selected === item.id ? "text-slate-400 hover:text-white" : "text-slate-300 hover:text-red-600"}`} title="Remove from course"><Trash2 className="h-4 w-4" /></button></div>)}{!materials.length ? <div className="p-10 text-center"><Presentation className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No materials yet</p><p className="mt-1 text-xs leading-5 text-slate-400">Upload the facilitator deck or learner workbook.</p></div> : null}</div></section><section>{selected ? <CourseMaterialViewer materialId={selected} /> : <div className="flex min-h-[460px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">Select a material to preview or present it.</div>}</section></div>
  </div>;
}

function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
