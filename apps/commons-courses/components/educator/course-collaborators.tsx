"use client";

import { FormEvent, useEffect, useState } from "react";
import { useToast } from "@/components/toast-provider";

type CollaboratorRole = "co_owner" | "editor";

type Collaborator = {
  id: string;
  email: string;
  name?: string;
  role: CollaboratorRole;
  invitedAt?: string;
  lastInvitedAt?: string;
};

export function CourseCollaborators({ slug }: { slug?: string }) {
  const { toast } = useToast();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("editor");
  const [loading, setLoading] = useState(Boolean(slug));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/educator/courses/${slug}/collaborators`)
      .then((res) => res.json())
      .then((data) => {
        setCollaborators(data.collaborators || []);
        setCanManage(Boolean(data.canManageCollaborators));
      })
      .catch(() => setError("Could not load collaborators."))
      .finally(() => setLoading(false));
  }, [slug]);

  async function inviteCollaborator(event: FormEvent) {
    event.preventDefault();
    if (!slug) return;
    setSaving(true);
    setError("");
    setNotice("");

    const res = await fetch(`/api/educator/courses/${slug}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not invite collaborator.");
      toast({
        tone: "error",
        title: "Could not invite collaborator",
        description: data.error || "Please try again.",
      });
      return;
    }

    setCollaborators(data.collaborators || []);
    setEmail("");
    setName("");
    setRole("editor");
    setNotice("Invite sent.");
    toast({
      tone: "success",
      title: "Collaborator invited",
      description: `${email} can now help manage this course.`,
    });
  }

  async function removeCollaborator(id: string) {
    if (!slug) return;
    setError("");
    setNotice("");
    const res = await fetch(
      `/api/educator/courses/${slug}/collaborators?id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not remove collaborator.");
      toast({
        tone: "error",
        title: "Could not remove collaborator",
        description: data.error || "Please try again.",
      });
      return;
    }
    setCollaborators(data.collaborators || []);
    setNotice("Collaborator removed.");
    toast({
      tone: "success",
      title: "Collaborator removed",
      description: "Course access was updated.",
    });
  }

  if (!slug) {
    return (
      <section className="rounded-xl border border-slate-200 p-5">
        <h2 className="text-lg font-bold text-slate-900">Collaborators</h2>
        <p className="mt-1 text-sm text-slate-500">
          Save this course before inviting co-owners or editors.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 p-5">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900">Collaborators</h2>
        <p className="mt-1 text-sm text-slate-500">
          Invite co-owners and editors to help organize and manage this course.
        </p>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-3 rounded-lg bg-lime-50 p-3 text-sm text-lime-800">{notice}</p>}

      {canManage && (
        <form onSubmit={inviteCollaborator} className="mb-5 grid gap-3 md:grid-cols-[1fr_1fr_160px_auto]">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <input
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as CollaboratorRole)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            <option value="editor">Editor</option>
            <option value="co_owner">Co-owner</option>
          </select>
          <button
            disabled={saving}
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "Sending..." : "Invite"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading collaborators...</p>
      ) : collaborators.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
          No collaborators yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          {collaborators.map((collaborator) => (
            <div
              key={collaborator.id}
              className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 md:grid-cols-[1fr_auto]"
            >
              <div>
                <p className="font-bold text-slate-900">
                  {collaborator.name || collaborator.email}
                </p>
                <p className="text-sm text-slate-500">{collaborator.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">
                  {collaborator.role === "co_owner" ? "Co-owner" : "Editor"}
                </span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => removeCollaborator(collaborator.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
