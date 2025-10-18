"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import SpaceMessaging from "@/components/spaces/space-messaging";
import SpaceAuthPlaceholder from "@/components/spaces/space-auth-placeholder";
import { useParams } from "next/navigation";

interface FullSpace {
  spaceId: string;
  name: string;
  description?: string;
  members: any[];
  messages: any[];
}

export default function SpaceDetailPage() {
  const { spaceId } = useParams() as { spaceId: string };
  const { authState, login, ready } = useAuth();
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

  // If user is not signed in, show a placeholder prompting sign-in instead of the space view
  // Avoid rendering sign-in/join UI until the auth SDK is ready to prevent flicker
  if (!ready) {
    return (
      <div className="w-screen h-screen">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
            Loading...
          </div>
        )}
      </div>
    );
  }

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
      {space &&
        (() => {
          // Determine if the current user is a member of the space
          const lowerWallet = walletAddress?.toLowerCase();
          const isMember = !!space.members?.find((m: any) => {
            // members may be stored as { memberId } or similar
            const id = (m.memberId || m.humanId || m.agentId || m).toString();
            return id?.toLowerCase?.() === lowerWallet;
          });

          if (!isMember) {
            return (
              <SpaceAuthPlaceholder
                spaceId={space.spaceId}
                isMember={false}
                onJoined={async () => {
                  // reload space to pick up membership
                  try {
                    const res = await fetch(
                      `/api/spaces/space?spaceId=${spaceId}&full=true`,
                      { cache: "no-store" }
                    );
                    const data = await res.json();
                    if (res.ok) setSpace(data.data || data);
                  } catch (e) {
                    // ignore reload errors here
                  }
                }}
              />
            );
          }

          return (
            <SpaceMessaging
              onBack={() => window.close()}
              forceFullScreen
              spaceId={space.spaceId}
              spaceName={space.name}
            />
          );
        })()}
    </div>
  );
}
