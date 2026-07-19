"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PlansGrid } from "@/components/billing/plans-grid";

export interface UpgradePrompt {
  code: string; // 'upgrade_required' | 'limit_reached'
  feature?: string;
  message?: string;
}

/**
 * Paywall dialog: shows the plans inline so the user can start checkout
 * immediately instead of being bounced through an error message first.
 */
export function UpgradeDialog({
  prompt,
  onOpenChange,
}: {
  prompt: UpgradePrompt | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = prompt !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {prompt?.code === "limit_reached"
              ? "Plan limit reached"
              : "Upgrade to continue"}
          </DialogTitle>
          <DialogDescription>
            {prompt?.message ??
              "This feature is part of a paid plan. Pick a plan to continue."}
          </DialogDescription>
        </DialogHeader>
        <div className="pt-2">
          <PlansGrid dense />
        </div>
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
      feature: body?.feature ?? body?.message?.feature,
      message:
        typeof body?.message === "string"
          ? body.message
          : typeof body?.message?.message === "string"
            ? body.message.message
            : undefined,
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
