"use client";

import { FormEvent, useEffect, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, EmptyState, List, ListRow } from "@/components/ui/surface";

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("editor");
  const [loading, setLoading] = useState(Boolean(slug));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    const res = await fetch(`/api/educator/courses/${slug}/collaborators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not invite collaborator.");
      return;
    }
    setCollaborators(data.collaborators || []);
    toast({ tone: "success", title: "Invite sent", description: `${email} can now help manage this course.` });
    setEmail("");
    setName("");
    setRole("editor");
    setInviteOpen(false);
  }

  async function removeCollaborator(collaborator: Collaborator) {
    if (!slug) return;
    if (!window.confirm(`Remove ${collaborator.name || collaborator.email}?`)) return;
    const res = await fetch(
      `/api/educator/courses/${slug}/collaborators?id=${encodeURIComponent(collaborator.id)}`,
      { method: "DELETE" },
    );
    const data = await res.json();
    if (!res.ok) {
      toast({ tone: "error", title: "Could not remove collaborator", description: data.error || "Please try again." });
      return;
    }
    setCollaborators(data.collaborators || []);
    toast({ tone: "success", title: "Collaborator removed", description: "Course access was updated." });
  }

  if (!slug) {
    return <EmptyState icon={Users} title="Save the course before inviting collaborators" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading" : `${collaborators.length} collaborator${collaborators.length === 1 ? "" : "s"}`}
        </p>
        {canManage ? (
          <Button variant="primary" icon={UserPlus} onClick={() => setInviteOpen(true)}>
            Invite
          </Button>
        ) : null}
      </div>
      {error && !inviteOpen ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {collaborators.length ? (
        <List>
          {collaborators.map((collaborator) => (
            <ListRow
              key={collaborator.id}
              chevron={false}
              leading={
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium text-stone-600">
                  {(collaborator.name || collaborator.email).slice(0, 1).toUpperCase()}
                </span>
              }
              title={collaborator.name || collaborator.email}
              meta={collaborator.name ? collaborator.email : undefined}
              trailing={
                <>
                  <Badge>{collaborator.role === "co_owner" ? "Co-owner" : "Editor"}</Badge>
                  {canManage ? (
                    <Button size="sm" variant="ghost" onClick={() => void removeCollaborator(collaborator)}>
                      Remove
                    </Button>
                  ) : null}
                </>
              }
            />
          ))}
        </List>
      ) : !loading ? (
        <EmptyState icon={Users} title="No collaborators yet" description="Invite co-owners and editors to help run this course." />
      ) : null}

      <Drawer
        as="form"
        onSubmit={inviteCollaborator}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite collaborator"
        footer={
          <Button type="submit" variant="primary" loading={saving}>
            Send invite
          </Button>
        }
      >
        <div className="space-y-5">
          <Field label="Email">
            <Input type="email" required autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="Name" optional>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Role" info="Co-owners can manage collaborators. Editors can change course content.">
            <Select value={role} onChange={(event) => setRole(event.target.value as CollaboratorRole)}>
              <option value="editor">Editor</option>
              <option value="co_owner">Co-owner</option>
            </Select>
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </Drawer>
    </div>
  );
}
