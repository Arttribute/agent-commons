"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { cn } from "@/lib/utils";

interface AgentAvatarUploaderProps {
  agentId: string;
  name: string;
  avatarUrl?: string;
  size?: number;
  disabled?: boolean;
  /** Called with the updated agent after a successful upload. */
  onUploaded: (avatarUrl: string, agent?: any) => void;
}

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Editable agent avatar. Renders the agent's profile image (falling back to a
 * generated avatar) with a camera button overlay that opens a file picker and
 * uploads the selected image to the backend, persisting it on the agent.
 */
export default function AgentAvatarUploader({
  agentId,
  name,
  avatarUrl,
  size = 96,
  disabled = false,
  onUploaded,
}: AgentAvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const displayUrl = preview ?? avatarUrl;

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be smaller than 10 MB.");
      return;
    }

    setError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/agents/${agentId}/avatar`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.data?.avatar) {
        throw new Error(data?.message || data?.error || "Upload failed");
      }
      onUploaded(data.data.avatar as string, data.data);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <AgentAvatar name={name} src={displayUrl} size={size} />

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin text-foreground" />
          </div>
        )}

        {!disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-label={displayUrl ? "Change profile image" : "Add profile image"}
            title={displayUrl ? "Change profile image" : "Add profile image"}
            className={cn(
              "absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90",
              uploading && "opacity-60",
            )}
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
          disabled={disabled || uploading}
        />
      </div>
      {error && <p className="max-w-[160px] text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}
