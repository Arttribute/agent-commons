"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import {
  AudioLines,
  Check,
  ChevronDown,
  ImageIcon,
  Loader2,
  MessageSquarePlus,
  MessageSquareText,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Video,
} from "lucide-react";
import type {
  CanvasAnnotation,
  CanvasArtifact,
  CanvasProjectBundle,
  CanvasRevision,
  MediaCatalog,
  MediaKind,
  MediaModel,
} from "@/lib/canvas";
import { unwrapCanvasPayload } from "@/lib/canvas";
import { apiErrorMessage } from "@/lib/api-error";
import { relativeTime } from "@/lib/relative-time";
import { ArtifactIcon } from "@/components/artifacts/artifact-icon";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import { ChromeButton } from "./canvas-chrome";
import { noteLocationLabel, noteQuote } from "./canvas-notes";

/* ------------------------------------------------------------------ Notes */

export function NotesList({
  notes,
  numberOf,
  attachedIds,
  focusedNoteId,
  otherVersions,
  emptyHint,
  onFocus,
  onAddToChat,
  onToggleResolved,
  onDelete,
}: {
  notes: CanvasAnnotation[];
  numberOf: (id: string) => number;
  attachedIds: Set<string>;
  focusedNoteId?: string | null;
  otherVersions: number;
  emptyHint: string;
  onFocus: (note: CanvasAnnotation) => void;
  onAddToChat: (notes: CanvasAnnotation[]) => void;
  onToggleResolved: (note: CanvasAnnotation) => void;
  onDelete: (note: CanvasAnnotation) => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const open = notes.filter((note) => note.status !== "resolved");
  const resolved = notes.filter((note) => note.status === "resolved");

  if (!notes.length) {
    return (
      <div className="px-6 pb-8 pt-6 text-center">
        <MessageSquareText className="mx-auto h-5 w-5 text-stone-300" strokeWidth={1.75} />
        <p className="mt-2 text-sm text-stone-700">No notes on this version</p>
        <p className="mt-1 text-xs leading-5 text-stone-500">{emptyHint}</p>
        {otherVersions > 0 && (
          <p className="mt-3 text-xs text-stone-400">
            {otherVersions} {otherVersions === 1 ? "note is" : "notes are"} on other versions.
          </p>
        )}
      </div>
    );
  }

  const row = (note: CanvasAnnotation) => {
    const attached = attachedIds.has(note.annotationId);
    const location = noteLocationLabel(note);
    const quote = noteQuote(note);
    return (
      <li key={note.annotationId}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onFocus(note)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onFocus(note);
          }}
          className={cn(
            "group flex cursor-pointer gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-stone-50",
            note.annotationId === focusedNoteId && "bg-stone-50",
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white",
              note.status === "resolved" ? "bg-stone-300" : "bg-stone-900",
            )}
          >
            {numberOf(note.annotationId)}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("line-clamp-3 text-sm leading-5 text-stone-800", note.status === "resolved" && "text-stone-400 line-through")}>
              {note.body}
            </p>
            {quote && <p className="mt-1 line-clamp-1 text-xs text-stone-400">“{quote}”</p>}
            <p className="mt-1 text-[11px] text-stone-400">
              {[location, note.authorType === "agent" ? "From an agent" : null, relativeTime(note.createdAt)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div
            className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <ChromeButton label={attached ? "Added to chat" : "Add to chat"} disabled={attached} onClick={() => onAddToChat([note])}>
              <MessageSquarePlus />
            </ChromeButton>
            <ChromeButton label={note.status === "resolved" ? "Reopen" : "Resolve"} onClick={() => onToggleResolved(note)}>
              {note.status === "resolved" ? <RotateCcw /> : <Check />}
            </ChromeButton>
            <ChromeButton label="Delete" onClick={() => onDelete(note)}>
              <Trash2 />
            </ChromeButton>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="px-1.5 pb-2">
      <ul className="space-y-0.5">{open.map(row)}</ul>
      {resolved.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowResolved((value) => !value)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-stone-500 hover:text-stone-800"
            aria-expanded={showResolved}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !showResolved && "-rotate-90")} />
            Resolved ({resolved.length})
          </button>
          {showResolved && <ul className="space-y-0.5">{resolved.map(row)}</ul>}
        </div>
      )}
      {otherVersions > 0 && (
        <p className="px-3 pt-2 text-[11px] text-stone-400">
          {otherVersions} more {otherVersions === 1 ? "note is" : "notes are"} on other versions.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- History */

export function HistoryList({
  bundle,
  activeItemId,
  onSelect,
  onUseSource,
  switching,
}: {
  bundle: CanvasProjectBundle;
  activeItemId: string;
  onSelect: (revision: CanvasRevision) => void;
  /** Ask the agent to use a source, e.g. switch to another music track. */
  onUseSource?: (asset: CanvasArtifact) => void;
  switching: string | null;
}) {
  const ordered = useMemo(
    () => [...bundle.revisions].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [bundle.revisions],
  );
  const running = bundle.jobs.filter((job) => job.status === "queued" || job.status === "running");
  // Linked files that are not themselves versions: references and inputs.
  const sources = useMemo(() => {
    const versionIds = new Set(bundle.revisions.map((revision) => revision.itemId));
    return bundle.assets.filter(
      (asset): asset is CanvasArtifact => Boolean(asset) && !versionIds.has(asset.itemId),
    );
  }, [bundle.assets, bundle.revisions]);

  return (
    <div className="pb-3">
      {running.map((job) => (
        <div key={job.jobId} className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl bg-stone-50 px-3 py-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-stone-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-stone-800 text-shimmer">Making a new version</p>
            <p className="text-[11px] text-stone-400">{job.progress ? `${job.progress}%` : "Queued"}</p>
          </div>
        </div>
      ))}
      <ol className="px-1.5">
        {[...ordered].reverse().map((revision) => {
          const index = ordered.indexOf(revision) + 1;
          const current = revision.itemId === activeItemId;
          const summary = (revision.settings as { summary?: string } | undefined)?.summary;
          return (
            <li key={revision.revisionId}>
              <button
                type="button"
                onClick={() => onSelect(revision)}
                disabled={current || switching !== null}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                  current ? "bg-stone-50" : "hover:bg-stone-50",
                )}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-stone-500 ring-1 ring-stone-200">
                  {switching === revision.revisionId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArtifactIcon artifact={revision.artifact ?? {}} className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-stone-900">Version {index}</span>
                    {current && <span className="rounded-full bg-stone-900 px-1.5 py-px text-[10px] text-white">Current</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-stone-500">{describeRevision(revision)}</span>
                  {summary && <span className="mt-1 line-clamp-2 block text-xs text-stone-600">{summary}</span>}
                  <span className="mt-0.5 block text-[11px] text-stone-400">{relativeTime(revision.createdAt)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {sources.length > 0 && (
        <div className="mt-2 border-t border-stone-100 px-1.5 pt-2">
          <p className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-500">
            Sources
            <InfoHint>Files that went into making this artifact, such as references attached in chat.</InfoHint>
          </p>
          <ul>
            {sources.map((asset) => (
              <li key={asset.itemId} className="group flex items-center gap-1 rounded-xl pr-1.5 hover:bg-stone-50">
                {asset.mimeType.startsWith("audio/") ? (
                  <SourcePlayer asset={asset} />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                    <ArtifactIcon artifact={asset} className="h-4 w-4 text-stone-400" strokeWidth={1.75} />
                  </span>
                )}
                <Link
                  href={`/library/${encodeURIComponent(asset.itemId)}`}
                  className="min-w-0 flex-1 truncate py-2 text-sm text-stone-700 hover:text-stone-900"
                  title={asset.name}
                >
                  {asset.name}
                </Link>
                {onUseSource && (
                  <button
                    type="button"
                    onClick={() => onUseSource(asset)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs text-stone-500 opacity-0 transition hover:bg-white hover:text-stone-900 focus:opacity-100 group-hover:opacity-100"
                  >
                    Use this
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function describeRevision(revision: CanvasRevision) {
  if (revision.operation === "import") return "Original";
  const who = revision.createdByType === "agent" ? "an agent" : revision.createdByType === "service" ? "Commons" : "you";
  if (revision.operation === "generate") return revision.modelId ? `Generated with ${revision.modelId}` : `Generated by ${who}`;
  if (revision.operation === "transform") return revision.modelId ? `Edited with ${revision.modelId}` : `Edited by ${who}`;
  return `Edited by ${who}`;
}

/* --------------------------------------------------------- Creative tools */

export type CreativeDefaults = Partial<Record<MediaKind, { modelKey?: string; settings?: Record<string, unknown> }>>;

const KINDS: Array<{ kind: MediaKind; label: string; icon: typeof ImageIcon }> = [
  { kind: "image", label: "Images", icon: ImageIcon },
  { kind: "video", label: "Video", icon: Video },
  { kind: "audio", label: "Speech", icon: AudioLines },
  { kind: "music", label: "Music", icon: Music2 },
];

const DEFAULTS_KEY = "commons.canvas.creativeDefaults";

export function rememberedCreativeDefaults(mode = "cloud"): CreativeDefaults | null {
  try {
    const value = window.localStorage.getItem(mode === "private-local" ? `${DEFAULTS_KEY}.private-local` : DEFAULTS_KEY);
    return value ? (JSON.parse(value) as CreativeDefaults) : null;
  } catch {
    return null;
  }
}

export function CreativeTools({
  value,
  focusKind,
  onSave,
}: {
  value: CreativeDefaults;
  focusKind?: MediaKind | null;
  onSave: (next: CreativeDefaults) => Promise<void>;
}) {
  const { mode } = useWorkspaceMode();
  const [catalog, setCatalog] = useState<MediaCatalog | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<CreativeDefaults>(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    let cancelled = false;
    setCatalog(null);
    setError("");
    desktopApiFetch("/api/canvas/models", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(apiErrorMessage(payload, "Creative models could not be loaded"));
        if (!cancelled) setCatalog(unwrapCanvasPayload<MediaCatalog>(payload));
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Creative models could not be loaded");
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const kinds = useMemo(
    () => [...KINDS].sort((a, b) => Number(b.kind === focusKind) - Number(a.kind === focusKind)),
    [focusKind],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);

  if (error) return <p className="px-4 pb-4 text-xs text-red-600">{error}</p>;
  if (!catalog) {
    return (
      <div className="space-y-2 px-4 pb-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-9 animate-pulse rounded-lg bg-stone-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-4">
      {kinds.map(({ kind, label, icon: Icon }) => {
        const models = catalog.models.filter((model) => model.kind === kind && model.available);
        if (!models.length) return null;
        const selected = models.find((model) => model.modelKey === draft[kind]?.modelKey);
        return (
          <section key={kind}>
            <div className="mb-1.5 flex items-center gap-1.5 text-sm text-stone-800">
              <Icon className="h-4 w-4 text-stone-400" strokeWidth={1.75} />
              {label}
              {selected && <ModelInfo model={selected} />}
            </div>
            <select
              value={draft[kind]?.modelKey ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [kind]: event.target.value ? { modelKey: event.target.value, settings: {} } : undefined,
                }))
              }
              className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-sm text-stone-800 outline-none focus:border-stone-400"
              aria-label={`${label} model`}
            >
              <option value="">Let the agent choose</option>
              {models.map((model) => (
                <option key={model.modelKey} value={model.modelKey}>
                  {model.displayName}
                </option>
              ))}
            </select>
            {selected && selected.settings.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {selected.settings.map((field) => {
                  const current = draft[kind]?.settings?.[field.key] ?? field.default ?? "";
                  const update = (next: unknown) =>
                    setDraft((state) => ({
                      ...state,
                      [kind]: { modelKey: selected.modelKey, settings: { ...(state[kind]?.settings ?? {}), [field.key]: next } },
                    }));
                  return (
                    <label key={field.key} className={cn("block", field.type === "text" && "col-span-2")}>
                      <span className="flex items-center gap-1 text-[11px] text-stone-500">
                        {field.label}
                        {field.help && <InfoHint>{field.help}</InfoHint>}
                      </span>
                      {field.type === "select" ? (
                        <select
                          value={String(current)}
                          onChange={(event) => update(event.target.value)}
                          className="mt-1 h-8 w-full rounded-lg border border-stone-200 bg-white px-2 text-xs outline-none focus:border-stone-400"
                        >
                          {field.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={Boolean(current)}
                          onChange={(event) => update(event.target.checked)}
                          className="mt-2 block"
                        />
                      ) : (
                        <input
                          type={field.type === "number" ? "number" : "text"}
                          value={String(current)}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          onChange={(event) => update(field.type === "number" ? Number(event.target.value) : event.target.value)}
                          className="mt-1 h-8 w-full rounded-lg border border-stone-200 bg-white px-2 text-xs outline-none focus:border-stone-400"
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
      <div className="flex items-center justify-end gap-2 pt-1">
        {saved && !dirty && <span className="text-xs text-stone-500">Saved</span>}
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(draft);
              try {
                window.localStorage.setItem(mode === "private-local" ? `${DEFAULTS_KEY}.private-local` : DEFAULTS_KEY, JSON.stringify(draft));
              } catch {
                // Remembering defaults for new canvases is a convenience only.
              }
              setSaved(true);
            } finally {
              setSaving(false);
            }
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-stone-900 px-3 text-xs font-medium text-white hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save preferences
        </button>
      </div>
    </div>
  );
}

function ModelInfo({ model }: { model: MediaModel }) {
  return (
    <InfoHint label={`About ${model.displayName}`}>
      <span className="block text-stone-700">{model.description}</span>
      <span className="mt-1.5 block">{priceLabel(model)}</span>
    </InfoHint>
  );
}

function priceLabel(model: MediaModel) {
  if (model.provider === "local") return "Runs on this device without Commons credits.";
  const usd = model.pricing.usd;
  const amount = usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
  const unit =
    model.pricing.unit === "second"
      ? "per second"
      : model.pricing.unit === "image"
        ? "per image"
        : model.pricing.unit === "million_video_tokens"
          ? "per million video tokens"
          : model.pricing.unit === "audio_token"
            ? "per audio token"
            : `per ${model.pricing.unit.replace(/_/g, " ")}`;
  return `About ${amount} ${unit}, paid in credits.`;
}

/** Plays an audio source in place, for comparing music options. */
function SourcePlayer({ asset }: { asset: CanvasArtifact }) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(
    () => () => {
      audio.current?.pause();
      audio.current?.remove();
    },
    [],
  );
  const toggle = async () => {
    if (playing) {
      audio.current?.pause();
      return;
    }
    let source = url;
    if (!source) {
      const response = await fetch(`/api/library/${encodeURIComponent(asset.itemId)}/preview`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      const preview = payload?.data ?? payload;
      source = preview?.inline?.url ?? preview?.download?.url ?? null;
      setUrl(source);
    }
    if (!source) return;
    // One source plays at a time across the panel.
    document.querySelectorAll<HTMLAudioElement>("audio[data-canvas-source]").forEach((element) => element.pause());
    if (!audio.current) {
      audio.current = new Audio(source);
      audio.current.dataset.canvasSource = asset.itemId;
      audio.current.onplay = () => setPlaying(true);
      audio.current.onpause = () => setPlaying(false);
      audio.current.onended = () => setPlaying(false);
      document.body.appendChild(audio.current);
    }
    void audio.current.play();
  };
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-label={playing ? `Pause ${asset.name}` : `Play ${asset.name}`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:text-stone-900"
    >
      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </button>
  );
}
