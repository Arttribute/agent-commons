"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export type ResourceApproval = {
  changeId: string;
  agentId: string;
  resourceType: "computer";
  status: string;
  title: string;
  description?: string | null;
};
export function collectResourceApprovals(
  results: unknown[],
): ResourceApproval[] {
  const found = new Map<string, ResourceApproval>();
  for (let result of results) {
    try {
      if (typeof result === "string") result = JSON.parse(result);
      for (let depth = 0; depth < 4; depth++) {
        const wrapped = result as any;
        if (wrapped?.toolData !== undefined) result = wrapped.toolData;
        else if (wrapped?.data !== undefined) result = wrapped.data;
        else break;
        if (typeof result === "string") result = JSON.parse(result);
      }
      for (const change of (result as any)?.changes ?? []) {
        if (
          change.resourceType === "computer" &&
          change.changeId &&
          change.agentId
        )
          found.set(change.changeId, change);
      }
    } catch {
      /* Unrelated tool output. */
    }
  }
  return [...found.values()];
}

export function ResourceApprovalCard({
  change,
  onApproved,
}: {
  change: ResourceApproval;
  onApproved?: (change: ResourceApproval) => void;
}) {
  const [verified, setVerified] = useState<ResourceApproval | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setVerified(null);
    setError(null);
    void fetch(
      `/api/agents/${encodeURIComponent(change.agentId)}/computer/upgrades/${encodeURIComponent(change.changeId)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.message || "Could not load resource request");
        const fresh = payload.data;
        if (
          fresh?.changeId !== change.changeId ||
          fresh?.agentId !== change.agentId ||
          fresh?.resourceType !== "computer"
        )
          throw new Error("Resource request could not be verified");
        if (!controller.signal.aborted) setVerified(fresh);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load resource request",
          );
      });
    return () => controller.abort();
  }, [change.agentId, change.changeId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function review(action: "accept" | "reject") {
    if (!verified || verified.status !== "pending") return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/agents/${encodeURIComponent(change.agentId)}/computer/upgrades/${encodeURIComponent(change.changeId)}/${action}`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.message ||
            payload.error ||
            "Could not review resource request",
        );
      setVerified({
        ...verified,
        status: action === "accept" ? "applied" : "rejected",
      });
      window.dispatchEvent(
        new CustomEvent("agent-commons:computer-updated", {
          detail: { agentId: change.agentId },
        }),
      );
      if (action === "accept") onApproved?.(verified);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not review resource request",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="not-prose my-3 space-y-2 rounded-xl border border-border bg-white p-4 text-sm">
      <p className="font-medium">{verified?.title ?? "Resource request"}</p>
      {verified?.description && (
        <p className="text-xs text-muted-foreground">{verified.description}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {verified?.status === "pending" ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void review("accept")}
          >
            {busy ? "Reviewing…" : "Approve resources"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void review("reject")}
          >
            Decline
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {!verified
            ? "Checking the saved request…"
            : verified.status === "applied"
              ? "Approved for the requested task."
              : verified.status === "rejected"
                ? "Declined. No additional resources were activated."
                : `Request ${verified.status}.`}
        </p>
      )}
    </div>
  );
}
