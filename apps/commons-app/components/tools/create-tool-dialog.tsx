"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

/**
 * Minimal tool creation: name + description (+ visibility). Creating the tool
 * takes the owner straight to /studio/tools/[toolId], where the API spec,
 * schema, keys, and permissions can be configured.
 */
export function CreateToolDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">(
    "private",
  );
  const [creating, setCreating] = useState(false);

  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  const reset = () => {
    setDisplayName("");
    setDescription("");
    setVisibility("private");
  };

  const handleCreate = async () => {
    if (!slug || !description.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: slug,
          displayName: displayName.trim(),
          description: description.trim(),
          visibility,
          version: "1.0.0",
          schema: {
            type: "function",
            function: {
              name: slug,
              description: description.trim(),
              parameters: { type: "object", properties: {}, required: [] },
            },
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Failed to create tool");
      }
      const toolId = data?.data?.toolId;
      reset();
      onOpenChange(false);
      router.push(toolId ? `/studio/tools/${toolId}` : "/studio/tools");
    } catch (error: any) {
      toast({
        title: "Could not create tool",
        description: error.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create new tool</DialogTitle>
          <DialogDescription>
            Name it and describe what it does — you can configure the API and
            schema on the tool page next.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="tool-name">Name</Label>
            <Input
              id="tool-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Weather lookup"
              autoFocus
            />
            {slug && (
              <p className="text-xs text-muted-foreground">
                Tool ID: <code className="font-mono">{slug}</code>
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tool-description">Description</Label>
            <Textarea
              id="tool-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this tool do? Agents use this to decide when to call it."
              className="min-h-20"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(value: "private" | "public") =>
                setVisibility(value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private — only you</SelectItem>
                <SelectItem value="public">Public — anyone can use</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !slug || !description.trim()}
            className="gap-1.5"
          >
            {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
