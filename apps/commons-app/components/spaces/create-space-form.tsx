"use client";
import { useState } from "react";
import { useCreateSpace } from "@/hooks/spaces/use-create-space";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface Props {
  creatorId?: string;
  onCreated?: (space: any) => void;
}

export function CreateSpaceForm({ creatorId, onCreated }: Props) {
  const { createSpace, loading, error } = useCreateSpace(creatorId, "human");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [maxMembers, setMaxMembers] = useState<number | "">("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const space = await createSpace({
      name: name.trim(),
      description: description.trim() || undefined,
      isPublic,
      maxMembers: maxMembers === "" ? undefined : Number(maxMembers),
    });
    setName("");
    setDescription("");
    setMaxMembers("");
    onCreated?.(space);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 p-4 border rounded-lg bg-white"
    >
      <div>
        <label className="block text-xs font-medium mb-1">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Space"
          required
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Description</label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional short description"
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={isPublic}
          onCheckedChange={(v) => setIsPublic(v)}
          id="public-switch"
        />
        <label htmlFor="public-switch" className="text-xs text-gray-600">
          Public (visible to everyone)
        </label>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">
          Max Members (optional)
        </label>
        <Input
          type="number"
          min={1}
          value={maxMembers}
          onChange={(e) =>
            setMaxMembers(e.target.value ? Number(e.target.value) : "")
          }
          placeholder="e.g. 10"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button
        type="submit"
        size="sm"
        disabled={loading || !creatorId}
        className="w-full"
      >
        {loading ? "Creating..." : "Create Space"}
      </Button>
    </form>
  );
}
