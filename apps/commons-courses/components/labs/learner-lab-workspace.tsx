"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  ChevronRight,
  Download,
  ExternalLink,
  File,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  LoaderCircle,
  Maximize2,
  Menu,
  Minimize2,
  PencilLine,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveLabWorkspaceEntry } from "@/lib/lab-workspace-entry";
import type {
  LabWorkspaceFileRecord,
  LabWorkspaceRecord,
} from "@/types/lab-workspace";

type FolderIndex = Map<
  string,
  { folders: string[]; files: LabWorkspaceFileRecord[] }
>;

export function LearnerLabWorkspace({
  workspaceId,
  entryPath,
  compact = false,
}: {
  workspaceId: string;
  entryPath?: string;
  compact?: boolean;
}) {
  const [workspace, setWorkspace] = useState<LabWorkspaceRecord | null>(null);
  const [folderPath, setFolderPath] = useState("");
  const [openFile, setOpenFile] = useState<LabWorkspaceFileRecord | null>(null);
  const [workingCopy, setWorkingCopy] = useState("");
  const [folderDrawerOpen, setFolderDrawerOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/lab-workspaces/${workspaceId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(body.error || "Could not open this lab.");
        if (!active) return;
        const next = body.workspace as LabWorkspaceRecord;
        const entry = resolveLabWorkspaceEntry(next.files, entryPath);
        setError("");
        setWorkspace(next);
        setFolderPath(entry.folderPath);
        setOpenFile(entry.file || null);
        setWorkingCopy(
          entry.file
            ? (window.localStorage.getItem(
                storageKey(workspaceId, entry.file.id),
              ) ??
                entry.file.preview ??
                "")
            : "",
        );
      })
      .catch((reason) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, [entryPath, workspaceId]);

  const folders = useMemo(
    () => buildFolderIndex(workspace?.files || []),
    [workspace],
  );
  const current = folders.get(folderPath) || { folders: [], files: [] };

  if (error)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {error}
      </div>
    );
  if (!workspace)
    return (
      <div className="flex min-h-52 items-center justify-center rounded-2xl border border-stone-200 bg-white text-sm text-stone-500">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Preparing your lab workspace…
      </div>
    );

  function openArtifact(file: LabWorkspaceFileRecord) {
    setOpenFile(file);
    setWorkingCopy(
      window.localStorage.getItem(storageKey(workspaceId, file.id)) ??
        file.preview ??
        "",
    );
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm",
        compact ? "my-2" : "my-8",
      )}
    >
      <header className="flex min-h-16 items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
          <Archive className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-stone-900">
            {workspace.title}
          </p>
          <p className="text-[11px] text-stone-500">
            {workspace.learnerFileCount} files · Private workshop workspace
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFolderDrawerOpen((value) => !value)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 lg:hidden"
          aria-label="Show folders"
        >
          <Menu className="h-4 w-4" />
        </button>
        <a
          href={workspace.learnerPackDownloadUrl}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 shadow-sm hover:bg-stone-50"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Download pack</span>
        </a>
      </header>

      <div className="relative flex h-[min(720px,76vh)] min-h-[560px] overflow-hidden bg-stone-50">
        <FolderSidebar
          index={folders}
          selected={folderPath}
          open={folderDrawerOpen}
          onSelect={(path) => {
            setFolderPath(path);
            setFolderDrawerOpen(false);
          }}
          onClose={() => setFolderDrawerOpen(false)}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
            <Breadcrumbs path={folderPath} onSelect={setFolderPath} />
            <div className="mt-5">
              <h2 className="text-xl font-semibold tracking-tight text-stone-950">
                {folderPath
                  ? folderLabel(lastSegment(folderPath))
                  : "Workshop materials"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                {folderPath
                  ? `${current.folders.length} folders · ${current.files.length} files`
                  : workspace.description ||
                    "Everything you need for the workshop, organized by learning block."}
              </p>
            </div>
            {!folderPath && workspace.instructions ? (
              <div className="mt-5 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                <span className="font-semibold">Start here. </span>
                {workspace.instructions}
              </div>
            ) : null}
            {current.folders.length ? (
              <FolderGrid
                names={current.folders}
                parent={folderPath}
                index={folders}
                onSelect={setFolderPath}
              />
            ) : null}
            {current.files.length ? (
              <section className="mt-7">
                <SectionLabel>Files</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {current.files.map((file) => (
                    <ArtifactCard
                      key={file.id}
                      file={file}
                      onOpen={openArtifact}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            {!current.folders.length && !current.files.length ? (
              <div className="mt-8 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
                This folder is empty.
              </div>
            ) : null}
          </div>
        </main>
        {openFile ? (
          <LabArtifactSurface
            key={openFile.id}
            file={openFile}
            value={workingCopy}
            onChange={setWorkingCopy}
            onClose={() => setOpenFile(null)}
            onSave={() =>
              window.localStorage.setItem(
                storageKey(workspaceId, openFile.id),
                workingCopy,
              )
            }
            onReset={() => {
              setWorkingCopy(openFile.preview || "");
              window.localStorage.removeItem(
                storageKey(workspaceId, openFile.id),
              );
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

function FolderGrid({
  names,
  parent,
  index,
  onSelect,
}: {
  names: string[];
  parent: string;
  index: FolderIndex;
  onSelect: (path: string) => void;
}) {
  return (
    <section className="mt-7">
      <SectionLabel>Folders</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {names.map((name) => {
          const path = joinPath(parent, name);
          const child = index.get(path);
          return (
            <button
              type="button"
              key={path}
              onClick={() => onSelect(path)}
              className="group flex min-h-20 items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <Folder className="h-5 w-5 fill-current/10" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-stone-900">
                  {folderLabel(name)}
                </span>
                <span className="mt-0.5 block text-[11px] text-stone-500">
                  {(child?.folders.length || 0) + (child?.files.length || 0)}{" "}
                  items
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-stone-300 group-hover:text-stone-500" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FolderSidebar({
  index,
  selected,
  open,
  onSelect,
  onClose,
}: {
  index: FolderIndex;
  selected: string;
  open: boolean;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const paths = [...index.keys()].filter(Boolean).sort(naturalCompare);
  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close folders"
          onClick={onClose}
          className="absolute inset-0 z-20 bg-stone-950/20 backdrop-blur-[1px] lg:hidden"
        />
      ) : null}
      <aside
        className={cn(
          "z-30 w-64 shrink-0 border-r border-stone-200 bg-white p-3 transition-transform max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-xl",
          open ? "translate-x-0" : "max-lg:-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-2 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">
            Folders
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 lg:hidden"
            aria-label="Close folders"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onSelect("")}
          className={folderButtonClass(!selected)}
        >
          <Archive className="h-4 w-4 shrink-0" />
          <span className="truncate">All workshop materials</span>
        </button>
        <div className="mt-1 max-h-[calc(100%-48px)] overflow-y-auto">
          {paths.map((path) => {
            const depth = path.split("/").length - 1;
            return (
              <button
                type="button"
                key={path}
                onClick={() => onSelect(path)}
                className={folderButtonClass(path === selected)}
                style={{ paddingLeft: `${12 + depth * 14}px` }}
              >
                {path === selected ? (
                  <FolderOpen className="h-4 w-4 shrink-0 text-amber-700" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0 text-stone-400" />
                )}
                <span className="truncate">
                  {folderLabel(lastSegment(path))}
                </span>
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}

function ArtifactCard({
  file,
  onOpen,
}: {
  file: LabWorkspaceFileRecord;
  onOpen: (file: LabWorkspaceFileRecord) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(file)}
      className="group flex min-h-24 items-start gap-3 rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
        <LabArtifactIcon file={file} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-stone-900">
          {humanFileName(file.name)}
        </span>
        <span className="mt-1 block text-[11px] text-stone-500">
          {fileLabel(file)} · {formatSize(file.size)}
        </span>
        {file.purpose ? (
          <span className="mt-1.5 line-clamp-2 block text-[11px] leading-4 text-stone-400">
            {file.purpose}
          </span>
        ) : null}
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-stone-300 group-hover:text-stone-500" />
    </button>
  );
}

function LabArtifactSurface({
  file,
  value,
  onChange,
  onClose,
  onSave,
  onReset,
}: {
  file: LabWorkspaceFileRecord;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const surfaceRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const handle = () =>
      setFullscreen(document.fullscreenElement === surfaceRef.current);
    document.addEventListener("fullscreenchange", handle);
    return () => document.removeEventListener("fullscreenchange", handle);
  }, []);
  async function toggleFullscreen() {
    if (document.fullscreenElement === surfaceRef.current)
      await document.exitFullscreen();
    else await surfaceRef.current?.requestFullscreen({ navigationUI: "hide" });
  }
  function downloadCopy() {
    onSave();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([value], { type: file.mimeType }));
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function closeSurface() {
    if (file.editable) onSave();
    onClose();
  }
  return (
    <aside
      ref={surfaceRef}
      className={cn(
        "absolute inset-y-0 right-0 z-40 flex min-h-0 flex-col overflow-hidden border-l border-stone-200 bg-stone-50 shadow-2xl max-lg:inset-0 max-lg:w-full",
        fullscreen ? "w-full" : "w-[min(760px,68%)] min-w-[460px]",
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
          <LabArtifactIcon file={file} className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-stone-900">
            {humanFileName(file.name)}
          </p>
          <p className="text-[11px] text-stone-500">
            {fileLabel(file)} · {formatSize(file.size)}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          {file.editable ? (
            <ToolbarButton
              label={editing ? "Preview document" : "Edit working copy"}
              onClick={() => setEditing((current) => !current)}
            >
              <PencilLine className="h-4 w-4" />
            </ToolbarButton>
          ) : null}
          <a
            href={file.downloadUrl}
            title="Download original"
            className={toolbarClass}
          >
            <Download className="h-4 w-4" />
          </a>
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            title="Open in a new tab"
            className={toolbarClass}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <ToolbarButton
            label={fullscreen ? "Exit full screen" : "Full screen"}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </ToolbarButton>
          <ToolbarButton label="Close file" onClick={closeSurface}>
            <X className="h-4 w-4" />
          </ToolbarButton>
        </div>
      </header>
      <ArtifactPreview
        file={file}
        value={value}
        editing={editing}
        onChange={onChange}
        onSave={onSave}
      />
      {file.editable && editing ? (
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-stone-200 bg-white px-3 py-2.5">
          <button
            type="button"
            onClick={onSave}
            className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-800"
          >
            <Save className="h-3.5 w-3.5" />
            Save on this device
          </button>
          <button
            type="button"
            onClick={downloadCopy}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download copy
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <p className="ml-auto text-[10px] text-stone-400">
            Saved privately in this browser
          </p>
        </footer>
      ) : null}
    </aside>
  );
}

function ArtifactPreview({
  file,
  value,
  editing,
  onChange,
  onSave,
}: {
  file: LabWorkspaceFileRecord;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  if (file.editable && editing)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-stone-200/60 p-4 sm:p-7">
        <textarea
          aria-label={`Working copy of ${file.name}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onSave}
          spellCheck
          className="mx-auto block min-h-full w-full max-w-3xl resize-none border border-stone-200 bg-white p-6 font-mono text-[12px] leading-6 text-stone-800 shadow-lg outline-none focus:border-stone-400 sm:p-10"
        />
      </div>
    );
  if (file.mimeType === "application/pdf")
    return (
      <iframe
        title={file.name}
        src={`${file.url}#toolbar=0&navpanes=0&view=FitH`}
        className="min-h-0 flex-1 border-0 bg-stone-100"
      />
    );
  if (file.mimeType.startsWith("image/"))
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(#d6d3d1_0.7px,transparent_0.7px)] bg-[size:16px_16px] p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.url}
          alt={file.name}
          className="max-h-full max-w-full rounded-lg object-contain shadow-xl"
        />
      </div>
    );
  if (file.editable)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-stone-200/60 p-4 sm:p-7">
        <article className="mx-auto min-h-full max-w-3xl bg-white p-7 text-stone-800 shadow-lg sm:p-11">
          {file.mimeType.startsWith("text/csv") ? (
            <CsvPreview value={value} />
          ) : /\.md$/i.test(file.name) ? (
            <MarkdownPreview value={value} />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6">
              {value || "This file is empty."}
            </pre>
          )}
        </article>
      </div>
    );
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
          <LabArtifactIcon file={file} className="h-7 w-7" />
        </span>
        <p className="mt-4 text-sm font-medium text-stone-900">
          Open {humanFileName(file.name)} in its native app
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          Download this file to work with its full formatting and features.
        </p>
        <a
          href={file.downloadUrl}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white"
        >
          <Download className="h-3.5 w-3.5" />
          Download file
        </a>
      </div>
    </div>
  );
}

function Breadcrumbs({
  path,
  onSelect,
}: {
  path: string;
  onSelect: (path: string) => void;
}) {
  const segments = path ? path.split("/") : [];
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-stone-500">
      <button
        type="button"
        onClick={() => onSelect("")}
        className="rounded-md px-1.5 py-1 hover:bg-stone-200/70 hover:text-stone-900"
      >
        Workshop
      </button>
      {segments.map((segment, index) => {
        const target = segments.slice(0, index + 1).join("/");
        return (
          <span key={target} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-stone-300" />
            <button
              type="button"
              onClick={() => onSelect(target)}
              className="rounded-md px-1.5 py-1 hover:bg-stone-200/70 hover:text-stone-900"
            >
              {folderLabel(segment)}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

function MarkdownPreview({ value }: { value: string }) {
  const lines = value.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const table = readMarkdownTable(lines, index);
    if (table) {
      blocks.push(
        <div key={`table-${index}`} className="my-5 overflow-x-auto rounded-xl border border-stone-200">
          <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-stone-100 text-stone-800">
              <tr>
                {table.headers.map((cell, cellIndex) => (
                  <th
                    key={cellIndex}
                    className="border-b border-r border-stone-200 px-3 py-2.5 font-semibold last:border-r-0"
                  >
                    <InlineMarkdown value={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="odd:bg-white even:bg-stone-50/70">
                  {table.headers.map((_, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="border-b border-r border-stone-100 px-3 py-2.5 align-top last:border-r-0"
                    >
                      <InlineMarkdown value={row[cellIndex] || ""} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      index = table.nextIndex - 1;
      continue;
    }
    const line = lines[index];
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <div
          key={index}
          className={
            level === 1
              ? "mb-5 mt-1 text-2xl font-semibold tracking-tight"
              : level === 2
                ? "mb-3 mt-7 text-lg font-semibold"
                : "mb-2 mt-5 text-sm font-semibold"
          }
        >
          <InlineMarkdown value={heading[2]} />
        </div>,
      );
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={index} className="my-6 border-stone-200" />);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      blocks.push(
        <div key={index} className="flex gap-2 pl-1">
          <span className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-stone-400" />
          <p><InlineMarkdown value={bullet[1]} /></p>
        </div>,
      );
      continue;
    }
    const numbered = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (numbered) {
      blocks.push(
        <div key={index} className="flex gap-2 pl-1">
          <span className="min-w-5 font-medium text-stone-400">{numbered[1]}.</span>
          <p><InlineMarkdown value={numbered[2]} /></p>
        </div>,
      );
      continue;
    }
    blocks.push(
      line.trim() ? (
        <p key={index}><InlineMarkdown value={line} /></p>
      ) : (
        <div key={index} className="h-1" />
      ),
    );
  }
  return (
    <div className="space-y-3 text-sm leading-7">
      {blocks}
    </div>
  );
}

function readMarkdownTable(lines: string[], start: number) {
  if (start + 1 >= lines.length) return null;
  const headers = markdownTableCells(lines[start]);
  const divider = markdownTableCells(lines[start + 1]);
  if (
    headers.length < 2 ||
    divider.length !== headers.length ||
    !divider.every((cell) => /^:?-{3,}:?$/.test(cell))
  ) {
    return null;
  }
  const rows: string[][] = [];
  let nextIndex = start + 2;
  while (nextIndex < lines.length) {
    const cells = markdownTableCells(lines[nextIndex]);
    if (!cells.length) break;
    rows.push(cells);
    nextIndex += 1;
  }
  return { headers, rows, nextIndex };
}

function markdownTableCells(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];
  const body = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return body.split("|").map((cell) => cell.trim());
}
function InlineMarkdown({ value }: { value: string }) {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : part.startsWith("`") && part.endsWith("`") ? (
      <code
        key={index}
        className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[0.9em]"
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function CsvPreview({ value }: { value: string }) {
  const rows = parseCsv(value).slice(0, 200);
  if (!rows.length)
    return <p className="text-sm text-stone-500">This file is empty.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="bg-stone-100 text-stone-700">
          <tr>
            {rows[0].map((cell, index) => (
              <th
                key={index}
                className="border-b border-r border-stone-200 px-3 py-2 font-semibold last:border-r-0"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-white even:bg-stone-50/60">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border-b border-r border-stone-100 px-3 py-2 text-stone-600 last:border-r-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LabArtifactIcon({
  file,
  className,
}: {
  file: LabWorkspaceFileRecord;
  className?: string;
}) {
  const Icon = file.mimeType.startsWith("image/")
    ? FileImage
    : file.mimeType.startsWith("text/csv") || /\.(xlsx?|csv)$/i.test(file.name)
      ? FileSpreadsheet
      : file.editable
        ? FileCode2
        : file.mimeType === "application/pdf"
          ? FileText
          : File;
  return <Icon className={className} />;
}
function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={toolbarClass}
    >
      {children}
    </button>
  );
}
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">
      {children}
    </p>
  );
}

function buildFolderIndex(files: LabWorkspaceFileRecord[]): FolderIndex {
  const index: FolderIndex = new Map([["", { folders: [], files: [] }]]);
  for (const file of [...files].sort((a, b) =>
    naturalCompare(a.path, b.path),
  )) {
    const segments = file.path.split("/");
    const filename = segments.pop();
    if (!filename) continue;
    let parent = "";
    for (const segment of segments) {
      const current = index.get(parent) || { folders: [], files: [] };
      if (!current.folders.includes(segment)) current.folders.push(segment);
      current.folders.sort(naturalCompare);
      index.set(parent, current);
      parent = joinPath(parent, segment);
      if (!index.has(parent)) index.set(parent, { folders: [], files: [] });
    }
    const folder = index.get(parent) || { folders: [], files: [] };
    folder.files.push(file);
    index.set(parent, folder);
  }
  return index;
}
function parseCsv(value: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && value[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
function folderButtonClass(active: boolean) {
  return cn(
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition",
    active
      ? "bg-stone-100 font-medium text-stone-900"
      : "text-stone-600 hover:bg-stone-50 hover:text-stone-900",
  );
}
const toolbarClass =
  "flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900";
function joinPath(parent: string, child: string) {
  return parent ? `${parent}/${child}` : child;
}
function lastSegment(path: string) {
  return path.split("/").at(-1) || path;
}
function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
function folderLabel(value: string) {
  return value
    .replace(/^\d+_/, "")
    .replace(/_/g, " ")
    .replace(/Block(\d+)/i, "Block $1 ·");
}
function humanFileName(value: string) {
  return value.replace(/\.[^.]+$/, "").replace(/_/g, " ");
}
function fileLabel(file: LabWorkspaceFileRecord) {
  return file.mimeType === "application/pdf"
    ? "PDF"
    : file.mimeType.startsWith("text/csv")
      ? "Spreadsheet"
      : /\.md$/i.test(file.name)
        ? "Markdown"
        : /\.txt$/i.test(file.name)
          ? "Text"
          : file.name.split(".").at(-1)?.toUpperCase() || "File";
}
function storageKey(workspaceId: string, fileId: string) {
  return `commonlab:lab:${workspaceId}:${fileId}`;
}
function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
