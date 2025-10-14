"use client";

import AppBar from "@/components/layout/app-bar";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useAuth } from "@/context/AuthContext";
import { CreateSpaceForm } from "@/components/spaces/create-space-form";
import { useRouter } from "next/navigation";

export default function CreateSpacePage() {
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const humanId = walletAddress?.toLowerCase();
  const router = useRouter();

  return (
    <div>
      <div className="mt-12">
        <div className="flex">
          <div className="w-full p-4 max-w-xl">
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
    </div>
  );
}
