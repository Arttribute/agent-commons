"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Download, LoaderCircle, Trash2, Upload } from "lucide-react";
import { LearnerLabWorkspace } from "@/components/labs/learner-lab-workspace";
import type { LabWorkspaceRecord } from "@/types/lab-workspace";

export function LabWorkspaceLibrary({ slug }: { slug: string }) {
  const [workspaces, setWorkspaces] = useState<LabWorkspaceRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [visibility, setVisibility] = useState<"course" | "live">("course");
  const inputRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const response = await fetch(
      `/api/educator/courses/${slug}/lab-workspaces`,
      { cache: "no-store" },
    );
    const body = await response.json().catch(() => ({}));
    if (response.ok) setWorkspaces(body.workspaces || []);
    else setNotice(body.error || "Could not load labs.");
  }, [slug]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function upload(file?: File) {
    if (!file || !title.trim()) {
      setNotice("Add a title and choose a ZIP lab pack.");
      return;
    }
    setUploading(true);
    setNotice("");
    const form = new FormData();
    form.append("archive", file);
    form.append("title", title);
    form.append("description", description);
    form.append("instructions", instructions);
    form.append("visibility", visibility);
    const response = await fetch(
      `/api/educator/courses/${slug}/lab-workspaces`,
      { method: "POST", body: form },
    );
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setWorkspaces((current) => [body.workspace, ...current]);
      setSelected(body.workspace.id);
      setTitle("");
      setDescription("");
      setInstructions("");
      setNotice(
        `Lab ready: ${body.workspace.learnerFileCount} learner files; ${body.workspace.facilitatorFileCount} facilitator-only files protected.`,
      );
    } else setNotice(body.error || "Could not create the lab workspace.");
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this lab workspace and its stored files?"))
      return;
    const response = await fetch(`/api/educator/lab-workspaces/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) return;
    setWorkspaces((current) => current.filter((item) => item.id !== id));
    if (selected === id) setSelected("");
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          Learner practice
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
          Lab workspaces
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload a structured ZIP once. Learners receive a safe workspace and
          learner-only download pack; facilitator files stay private.
        </p>
      </header>
      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Lab title"
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
        />
        <select
          value={visibility}
          onChange={(event) =>
            setVisibility(event.target.value as "course" | "live")
          }
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"
        >
          <option value="course">All enrolled learners</option>
          <option value="live">Live attendees only</option>
        </select>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Short learner-facing description"
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm lg:col-span-2"
        />
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Lab brief and setup instructions"
          rows={3}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm lg:col-span-2"
        />
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white lg:col-span-2">
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          {uploading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Choose ZIP and create workspace
        </label>
      </section>
      {notice ? (
        <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {notice}
        </div>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-3">
          {workspaces.map((item) => (
            <div
              key={item.id}
              className={`group mb-1 flex items-center rounded-xl ${selected === item.id ? "bg-slate-950 text-white" : "hover:bg-slate-50"}`}
            >
              <button
                onClick={() => setSelected(item.id)}
                className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
              >
                <Archive className="h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">
                    {item.title}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    {item.learnerFileCount} learner files ·{" "}
                    {item.facilitatorFileCount} private
                  </span>
                </span>
              </button>
              <a
                href={item.facilitatorPackDownloadUrl}
                title="Download full facilitator pack"
                className="p-2 opacity-0 group-hover:opacity-100"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                onClick={() => void remove(item.id)}
                title="Delete lab"
                className="mr-2 p-2 text-slate-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {!workspaces.length ? (
            <div className="p-10 text-center text-sm text-slate-400">
              No lab workspaces yet.
            </div>
          ) : null}
        </section>
        <section>
          {selected ? (
            <LearnerLabWorkspace workspaceId={selected} compact />
          ) : (
            <div className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-sm text-slate-400">
              Select a lab to preview the learner workspace.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
