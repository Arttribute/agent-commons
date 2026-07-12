"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export interface UpgradePrompt {
  code: string; // 'upgrade_required' | 'limit_reached'
  feature?: string;
  message?: string;
}

export function UpgradeDialog({
  prompt,
  onOpenChange,
}: {
  prompt: UpgradePrompt | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const open = prompt !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <Sparkles className="h-4 w-4" />
          </div>
          <DialogTitle>
            {prompt?.code === "limit_reached"
              ? "Plan limit reached"
              : "Upgrade required"}
          </DialogTitle>
          <DialogDescription>
            {prompt?.message ??
              "This feature is part of a paid plan. Upgrade to continue."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              const feature = prompt?.feature
                ? `?feature=${encodeURIComponent(prompt.feature)}`
                : "";
              router.push(`/settings/billing${feature}`);
            }}
          >
            View plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Parse a fetch Response + parsed body into an UpgradePrompt when the backend
 * signalled a 402 upgrade/limit condition, else null.
 */
export function upgradePromptFrom(
  status: number,
  body: any,
): UpgradePrompt | null {
  if (status !== 402) return null;
  const code = body?.code ?? body?.message?.code;
  if (code === "upgrade_required" || code === "limit_reached") {
    return {
      code,
      feature: body?.feature,
      message: typeof body?.message === "string" ? body.message : undefined,
    };
  }
  // Generic 402 (e.g. insufficient credits) still surfaces an upgrade path.
  return {
    code: "upgrade_required",
    message:
      typeof body?.message === "string"
        ? body.message
        : "You've run out of credits. Add credits or upgrade your plan.",
  };
}
