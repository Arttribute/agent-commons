"use client";

import { useEffect, useState } from "react";
import { FileText, Presentation } from "lucide-react";
import { CourseMaterialViewer } from "@/components/course-material-viewer";
import type { CourseMaterialRecord } from "@/types/course-material";

export function CourseMaterialsLibrary({ slug }: { slug: string }) {
  const [materials, setMaterials] = useState<CourseMaterialRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState("Loading materials…");
  useEffect(() => {
    fetch(`/api/courses/${slug}/materials`, { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => { if (ok) { setMaterials(body.materials || []); setNotice(""); } else setNotice(body.error || "Could not load materials."); })
      .catch(() => setNotice("Could not load materials."));
  }, [slug]);
  return <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]"><aside className="rounded-2xl border border-slate-200 bg-white p-3"><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Course materials</p>{materials.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${selected === item.id ? "bg-slate-950 text-white" : "hover:bg-slate-50"}`}>{item.kind === "pdf" ? <FileText className="h-4 w-4 shrink-0" /> : <Presentation className="h-4 w-4 shrink-0" />}<span className="min-w-0 flex-1 truncate text-sm font-bold">{item.name}</span></button>)}{notice ? <p className="p-6 text-center text-sm text-slate-400">{notice}</p> : !materials.length ? <p className="p-6 text-center text-sm text-slate-400">Your educator has not shared any materials yet.</p> : null}</aside><section>{selected ? <CourseMaterialViewer materialId={selected} /> : <div className="flex min-h-[460px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-400">Select a material to open it.</div>}</section></div>;
}
