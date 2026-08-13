"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ChevronDown,
  Download,
  File,
  FileText,
  FolderOpen,
  LoaderCircle,
  RotateCcw,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  LabWorkspaceFileRecord,
  LabWorkspaceRecord,
} from "@/types/lab-workspace";

export function LearnerLabWorkspace({
  workspaceId,
  compact = false,
}: {
  workspaceId: string;
  compact?: boolean;
}) {
  const [workspace, setWorkspace] = useState<LabWorkspaceRecord | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [workingCopy, setWorkingCopy] = useState("");
  const [error, setError] = useState("");
  const [filesOpen, setFilesOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`/api/lab-workspaces/${workspaceId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(body.error || "Could not open this lab.");
        if (!active) return;
        setWorkspace(body.workspace);
        const first = body.workspace.files[0];
        setSelectedId(first?.id || "");
        setWorkingCopy(
          first
            ? (window.localStorage.getItem(storageKey(workspaceId, first.id)) ??
                first.preview ??
                "")
            : "",
        );
      })
      .catch((reason) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const selected = workspace?.files.find((file) => file.id === selectedId);
  const folders = useMemo(
    () => groupFiles(workspace?.files || []),
    [workspace],
  );

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!workspace) {
    return (
      <div className="flex min-h-52 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Preparing your lab workspace…
      </div>
    );
  }

  function saveWorkingCopy() {
    if (!selected) return;
    window.localStorage.setItem(
      storageKey(workspaceId, selected.id),
      workingCopy,
    );
  }
  function downloadWorkingCopy() {
    if (!selected) return;
    saveWorkingCopy();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([workingCopy], { type: selected.mimeType }),
    );
    link.download = selected.name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200 bg-white",
        compact ? "my-2" : "my-8",
      )}
    >
      <header className="border-b border-slate-200 p-5 sm:flex sm:items-start sm:justify-between sm:gap-6 sm:p-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            <Archive className="h-3.5 w-3.5" />
            Lab workspace
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">
            {workspace.title}
          </h2>
          {workspace.description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              {workspace.description}
            </p>
          ) : null}
        </div>
        <a
          href={workspace.learnerPackDownloadUrl}
          className="mt-4 inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white sm:mt-0"
        >
          <Download className="h-4 w-4" />
          Download learner pack
        </a>
      </header>
      {workspace.instructions ? (
        <div className="border-b border-slate-200 bg-amber-50/60 px-5 py-4 text-sm leading-6 text-slate-700 sm:px-6">
          <span className="font-bold">Lab brief. </span>
          {workspace.instructions}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setFilesOpen((value) => !value)}
        className="flex w-full items-center justify-between border-b border-slate-200 px-5 py-3 text-left text-sm font-bold text-slate-700 lg:hidden"
      >
        <span className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4" />
          {selected?.path || `${workspace.learnerFileCount} files`}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 transition", filesOpen && "rotate-180")}
        />
      </button>
      <div className="grid min-h-[440px] lg:grid-cols-[280px_minmax(0,1fr)]">
        <LabFileList
          folders={folders}
          selectedId={selectedId}
          onSelect={(id) => {
            const file = workspace.files.find((item) => item.id === id);
            setSelectedId(id);
            setWorkingCopy(
              file
                ? (window.localStorage.getItem(storageKey(workspaceId, id)) ??
                    file.preview ??
                    "")
                : "",
            );
            setFilesOpen(false);
          }}
          className={cn(
            "border-b border-slate-200 lg:block lg:border-b-0 lg:border-r",
            filesOpen ? "block" : "hidden",
          )}
        />
        <div className="min-w-0 p-4 sm:p-6">
          {selected ? (
            <>
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-slate-900">
                    {selected.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {selected.purpose || selected.path} ·{" "}
                    {formatSize(selected.size)}
                  </p>
                </div>
                <a
                  href={selected.downloadUrl}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download original
                </a>
              </div>
              <FileWorkspace
                file={selected}
                value={workingCopy}
                onChange={setWorkingCopy}
                onSave={saveWorkingCopy}
                onDownload={downloadWorkingCopy}
                onReset={() => {
                  setWorkingCopy(selected.preview || "");
                  window.localStorage.removeItem(
                    storageKey(workspaceId, selected.id),
                  );
                }}
              />
            </>
          ) : (
            <div className="flex min-h-80 items-center justify-center text-sm text-slate-400">
              Choose a file to begin.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function LabFileList({
  folders,
  selectedId,
  onSelect,
  className,
}: {
  folders: Array<{ name: string; files: LabWorkspaceFileRecord[] }>;
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "max-h-[440px] overflow-y-auto bg-slate-50/70 p-3",
        className,
      )}
    >
      {folders.map((folder) => (
        <div key={folder.name} className="mb-4">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {folder.name}
          </p>
          <div className="mt-1 space-y-1">
            {folder.files.map((file) => (
              <button
                type="button"
                key={file.id}
                onClick={() => onSelect(file.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs",
                  selectedId === file.id
                    ? "bg-slate-950 font-bold text-white"
                    : "text-slate-600 hover:bg-white",
                )}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {file.path.split("/").slice(1).join("/") || file.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function FileWorkspace({
  file,
  value,
  onChange,
  onSave,
  onDownload,
  onReset,
}: {
  file: LabWorkspaceFileRecord;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onDownload: () => void;
  onReset: () => void;
}) {
  if (file.editable)
    return (
      <div className="pt-4">
        <textarea
          aria-label={`Working copy of ${file.name}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onSave}
          spellCheck={false}
          className="min-h-[320px] w-full resize-y rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none focus:border-slate-400"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white"
          >
            <Save className="h-3.5 w-3.5" />
            Save on this device
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            Download working copy
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-500"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Your edits stay privately in this browser until you download them.
        </p>
      </div>
    );
  if (file.mimeType === "application/pdf")
    return (
      <iframe
        title={file.name}
        src={file.url}
        className="mt-4 h-[520px] w-full rounded-xl border border-slate-200 bg-white"
      />
    );
  if (file.mimeType.startsWith("image/"))
    return (
      <div className="mt-4 flex min-h-80 items-center justify-center rounded-xl bg-slate-50 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.url}
          alt={file.name}
          className="max-h-[520px] max-w-full object-contain"
        />
      </div>
    );
  return (
    <div className="mt-4 flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      <File className="h-8 w-8 text-slate-300" />
      <p className="mt-3 text-sm font-bold text-slate-800">
        Ready to work with {file.name}
      </p>
      <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">
        This file type opens in its native app. Download it, work normally, and
        keep the rest of your lab files open here.
      </p>
      <a
        href={file.downloadUrl}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-bold text-white"
      >
        <Download className="h-3.5 w-3.5" />
        Download file
      </a>
    </div>
  );
}

function groupFiles(files: LabWorkspaceFileRecord[]) {
  const grouped = new Map<string, LabWorkspaceFileRecord[]>();
  for (const file of files) {
    const folder = file.path.includes("/")
      ? file.path.split("/")[0]
      : "Start here";
    grouped.set(folder, [...(grouped.get(folder) || []), file]);
  }
  return [...grouped.entries()].map(([name, folderFiles]) => ({
    name,
    files: folderFiles,
  }));
}
function storageKey(workspaceId: string, fileId: string) {
  return `commonlab:lab:${workspaceId}:${fileId}`;
}
function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
