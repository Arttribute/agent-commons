"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, ArrowLeft, Download, Plus, Trash2, Upload } from "lucide-react";
import { LearnerLabWorkspace } from "@/components/labs/learner-lab-workspace";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, EmptyState, List, ListRow } from "@/components/ui/surface";
import type { LabWorkspaceRecord } from "@/types/lab-workspace";

export function LabWorkspaceLibrary({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("lab") || "";
  const [workspaces, setWorkspaces] = useState<LabWorkspaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [visibility, setVisibility] = useState<"course" | "live">("course");
  const inputRef = useRef<HTMLInputElement>(null);

  const select = useCallback(
    (id: string) => router.replace(id ? `${pathname}?lab=${id}` : pathname, { scroll: false }),
    [pathname, router],
  );

  const load = useCallback(async () => {
    const response = await fetch(`/api/educator/courses/${slug}/lab-workspaces`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setWorkspaces(body.workspaces || []);
    else setNotice(body.error || "Could not load labs.");
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function upload(file?: File) {
    if (!file || !title.trim()) {
      setNotice("Add a title, then choose a ZIP lab pack.");
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
    const response = await fetch(`/api/educator/courses/${slug}/lab-workspaces`, { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setWorkspaces((current) => [body.workspace, ...current]);
      setTitle("");
      setDescription("");
      setInstructions("");
      setCreating(false);
      select(body.workspace.id);
    } else setNotice(body.error || "Could not create the lab workspace.");
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this lab workspace and its stored files?")) return;
    const response = await fetch(`/api/educator/lab-workspaces/${id}`, { method: "DELETE" });
    if (!response.ok) return;
    setWorkspaces((current) => current.filter((item) => item.id !== id));
    if (selected === id) select("");
  }

  const current = workspaces.find((item) => item.id === selected);

  if (selected) {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => select("")}
            className="inline-flex min-w-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{current?.title || "All labs"}</span>
          </button>
          {current ? (
            <div className="flex items-center gap-2">
              {current.facilitatorPackDownloadUrl ? (
                <ButtonLink size="sm" href={current.facilitatorPackDownloadUrl} icon={Download} external>
                  Facilitator pack
                </ButtonLink>
              ) : null}
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void remove(current.id)}>
                Delete
              </Button>
            </div>
          ) : null}
        </div>
        <LearnerLabWorkspace workspaceId={selected} compact />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading" : `${workspaces.length} lab${workspaces.length === 1 ? "" : "s"}`}
        </p>
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
          New lab
        </Button>
      </div>

      {workspaces.length ? (
        <List>
          {workspaces.map((item) => (
            <ListRow
              key={item.id}
              onClick={() => select(item.id)}
              leading={
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Archive className="h-4 w-4" strokeWidth={1.75} />
                </span>
              }
              title={item.title}
              meta={`${item.learnerFileCount} learner files · ${item.facilitatorFileCount} private`}
              trailing={<Badge>{item.visibility === "live" ? "Live attendees" : "All learners"}</Badge>}
            />
          ))}
        </List>
      ) : !loading ? (
        <EmptyState
          icon={Archive}
          title="No labs yet"
          description="Upload a structured ZIP. Learners get a safe workspace and facilitator files stay private."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              New lab
            </Button>
          }
        />
      ) : null}

      <Drawer open={creating} onClose={() => setCreating(false)} title="New lab workspace">
        <div className="space-y-5">
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Who can open it">
            <Select value={visibility} onChange={(event) => setVisibility(event.target.value as "course" | "live")}>
              <option value="course">All enrolled learners</option>
              <option value="live">Live attendees only</option>
            </Select>
          </Field>
          <Field label="Short description" optional>
            <Input value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field label="Brief and setup" optional>
            <Textarea rows={4} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
          </Field>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-page px-6 py-8 text-center transition-colors hover:bg-muted">
            <Upload className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-sm font-medium">{uploading ? "Creating workspace" : "Choose ZIP and create"}</span>
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
          {notice ? <p className="text-sm text-red-600">{notice}</p> : null}
        </div>
      </Drawer>
    </div>
  );
}
