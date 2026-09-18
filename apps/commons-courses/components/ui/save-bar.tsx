"use client";

import { Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Floating save control shown at the bottom of an editing view. It stays
 * quiet when everything is saved and becomes prominent once there are edits.
 */
export function SaveBar({
  dirty,
  saving,
  onSave,
  label = "Save changes",
  status,
  type = "button",
}: {
  dirty: boolean;
  saving?: boolean;
  onSave?: () => void;
  label?: string;
  status?: string;
  type?: "button" | "submit";
}) {
  return (
    <div className="pointer-events-none sticky bottom-4 z-20 mt-8 flex justify-end pr-16">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-white/95 py-1.5 pl-4 pr-1.5 shadow-floating backdrop-blur transition-opacity",
          !dirty && !saving && "opacity-80",
        )}
      >
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {dirty ? (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          ) : (
            <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2} />
          )}
          {status || (dirty ? "Unsaved changes" : "All changes saved")}
        </span>
        <Button
          type={type}
          variant={dirty ? "primary" : "secondary"}
          size="sm"
          icon={Save}
          loading={saving}
          disabled={!dirty}
          onClick={onSave}
          className="rounded-full"
        >
          {saving ? "Saving" : label}
        </Button>
      </div>
    </div>
  );
}
