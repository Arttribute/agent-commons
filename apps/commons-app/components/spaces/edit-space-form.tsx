"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import ImageUploader from "@/components/agents/ImageUploader";
import { useUpdateSpace } from "@/hooks/spaces/use-update-space";

interface Props {
  space: {
    spaceId: string;
    name: string;
    description?: string;
    image?: string;
    isPublic: boolean;
    maxMembers?: number | null;
  };
  onUpdated?: (space: any) => void;
}

export function EditSpaceForm({ space, onUpdated }: Props) {
  const { updateSpace, loading, error } = useUpdateSpace();
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description || "");
  const [image, setImage] = useState<string | undefined>(space.image);
  const [isPublic, setIsPublic] = useState(space.isPublic);
  const [maxMembers, setMaxMembers] = useState<number | "">(
    space.maxMembers ?? ""
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const updated = await updateSpace(space.spaceId, {
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      image,
      isPublic,
      maxMembers: maxMembers === "" ? null : Number(maxMembers),
    });
    onUpdated?.(updated);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-xs font-medium">Space image</label>
        <ImageUploader onImageChange={setImage} defaultImage={image} />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Description</label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={isPublic}
          onCheckedChange={(v) => setIsPublic(v)}
          id="public-switch"
        />
        <label htmlFor="public-switch" className="text-xs text-gray-600">
          Public
        </label>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Max Members</label>
        <Input
          type="number"
          min={1}
          value={maxMembers}
          onChange={(e) =>
            setMaxMembers(e.target.value ? Number(e.target.value) : "")
          }
          placeholder="Unlimited"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
