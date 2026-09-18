"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, Presentation, Trash2, Upload } from "lucide-react";
import { CourseMaterialViewer } from "@/components/course-material-viewer";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Select } from "@/components/ui/field";
import { Badge, EmptyState, List, ListRow } from "@/components/ui/surface";
import type { CourseMaterialRecord } from "@/types/course-material";

const visibilityLabels: Record<CourseMaterialRecord["visibility"], string> = {
  course: "All learners",
  live: "Live attendees",
  educator: "Facilitators only",
};

export function CourseMaterialLibrary({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("material") || "";
  const [materials, setMaterials] = useState<CourseMaterialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [visibility, setVisibility] = useState<CourseMaterialRecord["visibility"]>("course");
  const inputRef = useRef<HTMLInputElement>(null);

  const select = useCallback(
    (id: string) => router.replace(id ? `${pathname}?material=${id}` : pathname, { scroll: false }),
    [pathname, router],
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/educator/courses/${slug}/materials`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setMaterials(body.materials || []);
    else setNotice(body.error || "Could not load materials.");
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setNotice("");
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));
    form.append("visibility", visibility);
    const res = await fetch(`/api/educator/courses/${slug}/materials`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setMaterials((current) => [...(body.materials || []), ...current]);
      setUploadOpen(false);
    } else setNotice(body.error || "Could not upload materials.");
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this material from the course? The original stays in your Commons Library.")) return;
    const res = await fetch(`/api/educator/course-materials/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setMaterials((current) => current.filter((item) => item.id !== id));
    if (selected === id) select("");
  }

  const current = materials.find((item) => item.id === selected);

  if (selected) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => select("")}
            className="inline-flex min-w-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{current?.name || "All materials"}</span>
          </button>
          {current ? (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void remove(current.id)}>
              Remove
            </Button>
          ) : null}
        </div>
        <CourseMaterialViewer materialId={selected} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading" : `${materials.length} file${materials.length === 1 ? "" : "s"}`}
        </p>
        <Button variant="primary" icon={Upload} onClick={() => setUploadOpen(true)}>
          Upload
        </Button>
      </div>
      {notice && !uploadOpen ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-stone-600">{notice}</p>
      ) : null}

      {materials.length ? (
        <List>
          {materials.map((item) => (
            <ListRow
              key={item.id}
              onClick={() => select(item.id)}
              leading={
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {item.kind === "pdf" ? (
                    <FileText className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <Presentation className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </span>
              }
              title={item.name}
              meta={`${item.kind === "pdf" ? "PDF" : "Slides"} · ${formatSize(item.size)}`}
              trailing={<Badge>{visibilityLabels[item.visibility]}</Badge>}
            />
          ))}
        </List>
      ) : !loading ? (
        <EmptyState
          icon={Presentation}
          title="No materials yet"
          description="Upload a deck or workbook once, then reuse it in lessons and live sessions."
          action={
            <Button variant="primary" icon={Upload} onClick={() => setUploadOpen(true)}>
              Upload
            </Button>
          }
        />
      ) : null}

      <Drawer open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload material">
        <div className="space-y-5">
          <Field label="Who can open it" info="Uploads are also added to your Commons Library.">
            <Select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as CourseMaterialRecord["visibility"])}
            >
              <option value="course">All enrolled learners</option>
              <option value="live">Live attendees only</option>
              <option value="educator">Facilitators only</option>
            </Select>
          </Field>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-page px-6 py-10 text-center transition-colors hover:bg-muted">
            <Upload className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-sm font-medium">{uploading ? "Uploading" : "Choose PDF or PowerPoint files"}</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => void upload(event.target.files)}
            />
          </label>
          {notice ? <p className="text-sm text-red-600">{notice}</p> : null}
        </div>
      </Drawer>
    </div>
  );
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
