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
    <>
      <AppBar />
      <div className="flex justify-center min-h-screen  mt-16">
        <div className="w-full max-w-xl">
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
    </>
  );
}
