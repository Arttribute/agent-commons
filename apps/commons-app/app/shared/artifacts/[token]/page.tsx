import { Download, FileText, ShieldCheck } from "lucide-react";
import {
  ArtifactProvenance,
  type ArtifactProvenanceRecord,
} from "@/components/provenance/artifact-provenance";
import { prettyBytes } from "@/lib/artifacts";

export const dynamic = "force-dynamic";

type SharedArtifact = {
  item: {
    itemId: string;
    name: string;
    description?: string | null;
    kind: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    createdAt: string;
  };
  disclosure: { artifact: boolean; provenance: boolean; events: boolean };
  download?: { url: string; name: string; mimeType: string };
  provenance?: ArtifactProvenanceRecord;
  unavailable?: { artifact?: string; provenance?: string };
};

export default async function SharedArtifactPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL?.replace(/\/$/, "");
  let shared: SharedArtifact | null = null;
  let error = "This share link is unavailable or has expired.";
  if (baseUrl) {
    const response = await fetch(
      `${baseUrl}/v1/shared/artifacts/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const data = await response.json().catch(() => null);
    if (response.ok) shared = data?.data ?? data;
    else error = data?.message || data?.error || error;
  }

  if (!shared) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6 text-stone-900">
        <div className="max-w-sm text-center">
          <ShieldCheck className="mx-auto h-9 w-9 text-stone-300" />
          <h1 className="mt-4 text-lg font-medium">Share unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-stone-500">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4 sm:px-8">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100">
            <FileText className="h-4 w-4 text-stone-600" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-medium">{shared.item.name}</h1>
            <p className="mt-0.5 text-[11px] text-stone-500">
              {shared.item.kind.toUpperCase()} ·{" "}
              {prettyBytes(shared.item.sizeBytes)} · Shared from Agent Commons
            </p>
          </div>
          {shared.download?.url ? (
            <a
              href={shared.download.url}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-stone-900 px-3 text-xs font-medium text-white hover:bg-stone-800"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          ) : null}
        </div>
      </header>
      {shared.provenance ? (
        <ArtifactProvenance
          record={shared.provenance}
          className="mx-auto max-w-5xl bg-transparent"
        />
      ) : (
        <div className="mx-auto max-w-3xl p-8 text-center text-sm text-stone-500">
          {shared.unavailable?.provenance ||
            "This link shares the artifact without its provenance record."}
        </div>
      )}
    </main>
  );
}
