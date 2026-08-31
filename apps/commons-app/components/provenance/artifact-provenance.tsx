"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  FileClock,
  Fingerprint,
  Link2,
  Loader2,
  Share2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ArtifactProvenanceRecord = {
  context: string;
  resource: {
    itemId: string;
    name: string;
    kind: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    createdBy: string;
    address: { scheme: string; ref: string };
  };
  capture: {
    mode: string;
    linkage: string;
    traceCount: number;
    eventCount: number;
    droppedEvents: number;
  };
  entities: Array<{
    id: string;
    role: string;
    name?: string;
    provider?: string;
    modelId?: string;
  }>;
  runs: Array<{
    traceId: string;
    status: string;
    provider?: string;
    modelId?: string;
    startedAt: string;
    durationMs?: number;
    bundleHash?: string;
    anchorStatus?: string;
  }>;
  actions: Array<{
    id: string;
    category: string;
    name: string;
    summary?: string;
    status: string;
    performedBy?: string;
    contentHash?: string;
    startedAt: string;
    durationMs?: number;
  }>;
  derivation: {
    source?: { itemId: string; name: string; contentHash: string } | null;
    revisions: Array<{
      itemId: string;
      name: string;
      contentHash: string;
      createdAt: string;
    }>;
  };
  governance: {
    license: unknown;
    aiTraining: unknown;
    authorization: {
      visibility: string;
      sharing: string;
      grantCount: number;
      shareCount: number;
    };
  };
  integrity: {
    algorithm: string;
    contentHash: string;
    verified: boolean;
    bundleHashes: string[];
    anchors: Array<{
      traceId: string;
      status: string;
      provider?: string;
      reference?: string;
    }>;
  };
  history: Array<{
    eventId: string;
    action: string;
    actorType: string;
    actorId: string;
    createdAt: string;
    contentHash?: string;
    traceId?: string;
  }>;
  disclosure: {
    eventsIncluded: boolean;
    privateReasoningIncluded: false;
    credentialsIncluded: false;
  };
};

export function ArtifactProvenance({
  record,
  itemId,
  className,
}: {
  record: ArtifactProvenanceRecord;
  itemId?: string;
  className?: string;
}) {
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"record" | "link" | null>(null);
  const [shareScope, setShareScope] = useState<
    "provenance" | "artifact" | "timeline"
  >("provenance");
  const run = record.runs.at(-1);
  const ai = record.entities.find((entity) => entity.role === "ai");
  const actionRows = record.actions.length
    ? record.actions
    : record.history.map((event) => ({
        id: event.eventId,
        category: "artifact",
        name: humanize(event.action),
        status: "completed",
        performedBy: `${event.actorType}:${event.actorId}`,
        contentHash: event.contentHash,
        startedAt: event.createdAt,
      }));

  async function copyRecord() {
    await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopied("record");
    window.setTimeout(() => setCopied(null), 1600);
  }

  async function share() {
    if (!itemId) return;
    setSharing(true);
    setShareError(null);
    try {
      const response = await fetch(
        `/api/library/${encodeURIComponent(itemId)}/share-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
            disclosure: {
              artifact: shareScope !== "provenance",
              provenance: true,
              events: shareScope === "timeline",
            },
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        throw new Error(data?.message || "Could not create share link");
      }
      await navigator.clipboard.writeText(data.url);
      setCopied("link");
      window.setTimeout(() => setCopied(null), 1800);
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : "Could not create share link",
      );
    } finally {
      setSharing(false);
    }
  }

  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto bg-stone-50", className)}
    >
      <div className="mx-auto max-w-3xl p-5 sm:p-8">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-[11px] font-semibold text-emerald-700">
              Pr
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-stone-900">
                {record.integrity.verified ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : null}
                Provenance record
              </div>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                A structured record of who and what produced this artifact, how
                it changed, and how its integrity can be checked.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={copyRecord}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 text-[11px] font-medium text-stone-600 hover:bg-stone-50"
              >
                {copied === "record" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied === "record" ? "Copied" : "Copy JSON"}
              </button>
              {itemId ? (
                <div className="flex items-center rounded-lg bg-stone-900">
                  <label className="sr-only" htmlFor="provenance-share-scope">
                    Information to share
                  </label>
                  <select
                    id="provenance-share-scope"
                    value={shareScope}
                    onChange={(event) =>
                      setShareScope(event.target.value as typeof shareScope)
                    }
                    className="h-8 max-w-28 rounded-l-lg border-0 bg-stone-900 pl-2 text-[10px] text-stone-200 outline-none"
                  >
                    <option value="provenance">Provenance only</option>
                    <option value="artifact">Artifact + record</option>
                    <option value="timeline">Full timeline</option>
                  </select>
                  <button
                    type="button"
                    onClick={share}
                    disabled={sharing}
                    className="inline-flex h-8 items-center gap-1.5 rounded-r-lg bg-stone-900 px-2.5 text-[11px] font-medium text-white hover:bg-stone-800 disabled:opacity-60"
                  >
                    {sharing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : copied === "link" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Share2 className="h-3.5 w-3.5" />
                    )}
                    {copied === "link" ? "Link copied" : "Share"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {shareError ? (
            <p role="alert" className="mt-3 text-xs text-red-600">
              {shareError}
            </p>
          ) : null}

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <Fact
              icon={Fingerprint}
              label="Content integrity"
              value={shortHash(record.integrity.contentHash)}
              detail={record.integrity.algorithm.toUpperCase()}
            />
            <Fact
              icon={Sparkles}
              label="Produced with"
              value={ai?.modelId || run?.modelId || "No model recorded"}
              detail={ai?.provider || run?.provider || "Agent Commons"}
            />
            <Fact
              icon={FileClock}
              label="Trace"
              value={run ? shortId(run.traceId) : "Legacy artifact"}
              detail={`${record.capture.eventCount} recorded events`}
            />
          </div>
        </div>

        {record.derivation.source ? (
          <section className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
            <SectionTitle icon={Link2}>Derivation</SectionTitle>
            <p className="mt-3 text-xs text-stone-600">
              Revised from{" "}
              <span className="font-medium text-stone-900">
                {record.derivation.source.name}
              </span>
            </p>
            <p className="mt-1 font-mono text-[10px] text-stone-400">
              {shortHash(record.derivation.source.contentHash)}
            </p>
          </section>
        ) : null}

        <section className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
          <SectionTitle icon={Clock3}>Trail</SectionTitle>
          <div className="mt-3 divide-y divide-stone-100">
            {actionRows.length ? (
              actionRows.slice(-40).map((action) => (
                <div key={action.id} className="flex gap-3 py-3 first:pt-1">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-xs font-medium text-stone-800">
                        {action.name}
                      </p>
                      <time className="shrink-0 text-[10px] text-stone-400">
                        {formatDate(action.startedAt)}
                      </time>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-4 text-stone-500">
                      {action.summary ||
                        action.performedBy ||
                        humanize(action.category)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-4 text-xs text-stone-500">
                The artifact integrity record is available; no detailed run
                events were disclosed.
              </p>
            )}
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2">
          <GovernanceFact
            label="License"
            value={displayClaim(record.governance.license)}
          />
          <GovernanceFact
            label="AI training"
            value={displayClaim(record.governance.aiTraining)}
          />
          <GovernanceFact
            label="Access"
            value={humanize(record.governance.authorization.visibility)}
          />
          <GovernanceFact
            label="Verification"
            value={
              record.integrity.anchors.length
                ? humanize(
                    record.integrity.anchors.at(-1)?.status || "anchored",
                  )
                : "Content hash recorded"
            }
          />
        </section>

        <p className="mt-4 text-[10px] leading-4 text-stone-400">
          Provenance records evidence declared events and integrity; they do not
          by themselves prove that every claim is true. Private reasoning and
          credentials are never included.
        </p>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Fingerprint;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-stone-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-2 truncate text-xs font-medium text-stone-800">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[10px] text-stone-400">{detail}</p>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof Clock3;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-medium text-stone-800">
      <Icon className="h-3.5 w-3.5 text-stone-400" />
      {children}
    </h3>
  );
}

function GovernanceFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-stone-400">
        {label}
      </p>
      <p className="mt-1.5 text-xs text-stone-700">{value}</p>
    </div>
  );
}

function shortHash(value: string) {
  const hash = value.replace(/^sha256:/, "");
  return hash.length > 20 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash;
}

function shortId(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : value;
}

function humanize(value: string) {
  return value
    .replace(/[_.-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayClaim(value: unknown) {
  if (typeof value === "string") return humanize(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return "Not specified";
}
