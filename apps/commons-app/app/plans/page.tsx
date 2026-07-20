"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PlansGrid } from "@/components/billing/plans-grid";

export default function PlansPage() {
  const router = useRouter();

  function goBack() {
    // Return to wherever the user came from; fall back to home.
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal top bar: back button left, brand top right */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-background/95 px-4 py-3 backdrop-blur">
        <button
          onClick={goBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Image
          src="/logo.jpg"
          alt="Agent Commons"
          width={131}
          height={60}
          className="mr-2 h-8 w-auto shrink-0 rounded-md object-contain"
        />
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-20">
        <div className="text-center">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            Choose your plan
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every plan includes unlimited agents. Credits cover their work;
            plans set persistent computer slots and parallel usage.
          </p>
        </div>

        <div className="mt-10">
          <PlansGrid showTopups />
        </div>
      </div>
    </div>
  );
}
