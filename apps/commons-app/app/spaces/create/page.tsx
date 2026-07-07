"use client";

import { useAuth } from "@/context/AuthContext";
import { CreateSpaceForm } from "@/components/spaces/create-space-form";
import { useRouter } from "next/navigation";

export default function CreateSpacePage() {
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const humanId = walletAddress?.toLowerCase();
  const router = useRouter();

  return (
    <div className="h-screen overflow-hidden">
      <div className="flex justify-center pt-16 h-screen overflow-y-auto">
        <div className="w-full max-w-lg">
          <CreateSpaceForm
            creatorId={humanId}
            onCreated={(space) => {
              if (space?.spaceId) {
                router.push(`/spaces/${space.spaceId}`);
              } else {
                router.push("/spaces");
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
