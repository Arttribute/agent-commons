"use client";

import { useEffect, useState } from "react";
import { Archive, FileText, Presentation } from "lucide-react";
import { CourseMaterialViewer } from "@/components/course-material-viewer";
import { LearnerLabWorkspace } from "@/components/labs/learner-lab-workspace";
import type { CourseMaterialRecord } from "@/types/course-material";
import type { LabWorkspaceRecord } from "@/types/lab-workspace";

export function CourseMaterialsLibrary({ slug }: { slug: string }) {
  const [materials, setMaterials] = useState<CourseMaterialRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<LabWorkspaceRecord[]>([]);
  const [selected, setSelected] = useState<{ kind: "material" | "lab"; id: string } | null>(null);
  const [notice, setNotice] = useState("Loading materials…");
  useEffect(() => {
    fetch(`/api/courses/${slug}/materials`, { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => { if (ok) { setMaterials(body.materials || []); setWorkspaces(body.workspaces || []); setNotice(""); } else setNotice(body.error || "Could not load materials."); })
      .catch(() => setNotice("Could not load materials."));
  }, [slug]);
  return <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]"><aside className="rounded-2xl border border-slate-200 bg-white p-3"><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Course materials</p>{materials.map((item) => <button key={item.id} onClick={() => setSelected({ kind: "material", id: item.id })} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${selected?.kind === "material" && selected.id === item.id ? "bg-slate-950 text-white" : "hover:bg-slate-50"}`}>{item.kind === "pdf" ? <FileText className="h-4 w-4 shrink-0" /> : <Presentation className="h-4 w-4 shrink-0" />}<span className="min-w-0 flex-1 truncate text-sm font-bold">{item.name}</span></button>)}{workspaces.length ? <p className="mt-3 border-t border-slate-100 px-3 pb-2 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Lab workspaces</p> : null}{workspaces.map((item) => <button key={item.id} onClick={() => setSelected({ kind: "lab", id: item.id })} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${selected?.kind === "lab" && selected.id === item.id ? "bg-slate-950 text-white" : "hover:bg-slate-50"}`}><Archive className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate text-sm font-bold">{item.title}</span></button>)}{notice ? <p className="p-6 text-center text-sm text-slate-400">{notice}</p> : !materials.length && !workspaces.length ? <p className="p-6 text-center text-sm text-slate-400">Your educator has not shared any materials yet.</p> : null}</aside><section>{selected?.kind === "material" ? <CourseMaterialViewer materialId={selected.id} /> : selected?.kind === "lab" ? <LearnerLabWorkspace workspaceId={selected.id} compact /> : <div className="flex min-h-[460px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-400">Select a material or lab to open it.</div>}</section></div>;
}
