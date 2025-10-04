"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import SpaceMessaging from "@/components/sessions/chat/space-messaging";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface FullSpace {
  spaceId: string;
  name: string;
  description?: string;
  members: any[];
  messages: any[];
}

export default function SpaceDetailPage({
  params,
}: {
  params: { spaceId: string };
}) {
  const { spaceId } = params;
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const [space, setSpace] = useState<FullSpace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/spaces/space?spaceId=${spaceId}&full=true`,
          {
            cache: "no-store",
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load space");
        if (!cancelled) setSpace(data.data || data);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  return (
    <div className="w-screen h-screen">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
          Loading...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-red-500">
          {error}
        </div>
      )}
      {space && (
        <SpaceMessaging
          onBack={() => window.close()}
          forceFullScreen
          spaceId={space.spaceId}
          spaceName={space.name}
        />
      )}
    </div>
  );
}
