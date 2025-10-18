"use client";
import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

interface Props {
  spaceId: string;
  isMember?: boolean; // if true, component can render nothing (or a small notice)
  onJoined?: () => void;
}

export default function SpaceAuthPlaceholder({
  spaceId,
  isMember,
  onJoined,
}: Props) {
  const { authState, login } = useAuth();
  const { walletAddress } = authState;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If user is not signed in, show sign-in prompt
  if (!walletAddress) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="max-w-md p-6 rounded-lg text-center border bg-white/50 backdrop-blur">
          <h3 className="text-lg font-semibold mb-2">
            Sign in to join this space
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            You must be signed in to view or join spaces. Sign in to continue.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => login()} className="px-6">
              Sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // If user is already a member, render a small placeholder (page may render actual messaging)
  if (isMember) {
    return null;
  }

  // Not a member but signed in — offer join button
  const handleJoin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/spaces/members/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceId,
          memberId: walletAddress,
          memberType: "human",
          role: "member",
          permissions: { canWrite: true, canInvite: false, canModerate: false },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to join space");
      }
      onJoined?.();
    } catch (err: any) {
      setError(err?.message || "Failed to join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="max-w-md p-6 rounded-lg text-center border bg-white">
        <h3 className="text-lg font-semibold mb-2">Join this space</h3>
        <p className="text-sm text-muted-foreground mb-4">
          You are signed in but not yet a member of this space. Join to
          participate in conversations and use shared resources.
        </p>
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        <div className="flex items-center justify-center gap-2">
          <Button onClick={handleJoin} disabled={loading}>
            {loading ? "Joining..." : "Join Space"}
          </Button>
        </div>
      </div>
    </div>
  );
}
