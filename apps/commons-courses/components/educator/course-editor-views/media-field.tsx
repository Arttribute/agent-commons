"use client";

import { useRef, useState } from "react";
import { ImageIcon, Link2, LoaderCircle, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Image slot: a preview tile with Upload and Paste link actions. The URL
 * input only appears when the educator chooses to paste one.
 */
export function MediaField({
  label,
  value,
  onChange,
  onUpload,
  uploading,
  info = "Upload or link a public image. 1200 × 630 works best for sharing.",
  aspect = "wide",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onUpload: (file?: File) => void;
  uploading: boolean;
  info?: string;
  aspect?: "wide" | "square";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {info ? <InfoTip label={`About ${label}`}>{info}</InfoTip> : null}
      </div>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border bg-muted",
          aspect === "wide" ? "aspect-[1200/630]" : "aspect-square",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-5 w-5" strokeWidth={1.5} />
            <span className="text-xs">No image</span>
          </div>
        )}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={`Remove ${label}`}
            className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-stone-600 shadow-card hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={uploading}
        onChange={(event) => {
          onUpload(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" icon={Upload} onClick={() => inputRef.current?.click()} disabled={uploading}>
          Upload
        </Button>
        <Button size="sm" variant="ghost" icon={Link2} onClick={() => setPasting((open) => !open)}>
          Paste link
        </Button>
      </div>
      {pasting ? (
        <input
          type="url"
          value={value}
          autoFocus
          placeholder="https://"
          onChange={(event) => onChange(event.target.value)}
          className="ui-control mt-2"
        />
      ) : null}
    </div>
  );
}
