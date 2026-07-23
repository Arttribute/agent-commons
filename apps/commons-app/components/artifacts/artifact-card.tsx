"use client";

import { ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import { ArtifactIcon } from "./artifact-icon";
import {
  artifactKind,
  artifactLabel,
  prettyBytes,
  type ArtifactRef,
} from "@/lib/artifacts";
import { cn } from "@/lib/utils";

const kindStyles: Record<string, string> = {
  image: "bg-rose-50 text-rose-600",
  video: "bg-fuchsia-50 text-fuchsia-600",
  audio: "bg-amber-50 text-amber-600",
  presentation: "bg-orange-50 text-orange-600",
  spreadsheet: "bg-emerald-50 text-emerald-600",
  document: "bg-blue-50 text-blue-600",
  pdf: "bg-red-50 text-red-600",
  text: "bg-slate-100 text-slate-600",
  code: "bg-violet-50 text-violet-600",
  archive: "bg-yellow-50 text-yellow-700",
  other: "bg-stone-100 text-stone-600",
};

export function ArtifactCard({
  artifact,
  onOpen,
  compact = false,
  className,
}: {
  artifact: ArtifactRef;
  onOpen: (artifact: ArtifactRef) => void;
  compact?: boolean;
  className?: string;
}) {
  const kind = artifactKind(artifact);
  return (
    <button
      type="button"
      onClick={() => onOpen(artifact)}
      className={cn(
        "not-prose group flex min-w-0 items-center gap-3 rounded-xl border border-stone-200 bg-white text-left shadow-sm transition hover:-translate-y-px hover:border-stone-300 hover:shadow-md",
        compact ? "max-w-[20rem] px-2.5 py-2" : "w-full max-w-[28rem] p-3",
        className,
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg",
          compact ? "h-9 w-9" : "h-11 w-11",
          kindStyles[kind] || kindStyles.other,
        )}
      >
        <ArtifactIcon
          artifact={artifact}
          className={compact ? "h-4 w-4" : "h-5 w-5"}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-stone-900">
          {artifact.name || "Artifact"}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-500">
          <span>{artifactLabel(artifact)}</span>
          {artifact.sizeBytes ? (
            <>
              <span className="text-stone-300">·</span>
              <span>{prettyBytes(artifact.sizeBytes)}</span>
            </>
          ) : null}
          {artifact.status === "ready" || artifact.status === "uploaded" ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          ) : artifact.status === "processing" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : null}
        </span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-stone-300 transition group-hover:text-stone-600" />
    </button>
  );
}
