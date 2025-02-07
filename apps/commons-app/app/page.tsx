"use client";
import React from "react";
import { RetroGrid } from "@/components/magicui/retro-grid";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import AppBar from "@/components/layout/AppBar";
import Link from "next/link";

export default function Home() {
  return (
    <div>
      <AppBar />
      <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden rounded-lg bg-background md:shadow-xl">
        <div className="flex z-10">
          <p className=" h-20 pointer-events-none z-10 whitespace-pre-wrap bg-gradient-to-r from-blue-600 via-pink-500 to-indigo-500 bg-clip-text text-center text-7xl font-bold leading-none tracking-tighter text-transparent">
            Agent Commons
          </p>
        </div>
        <p className="text-xl text-center">
          The toolkit for building interactive AI-driven experiences
        </p>

        <div className="flex gap-4 mt-4 z-10">
          <Link href="/worlds/create" passHref>
            <Button className="rounded-lg px-16">Create</Button>
          </Link>

          <Link href="/worlds" passHref>
            <Button
              variant="outline"
              className="rounded-lg px-16 border border-gray-700"
            >
              Explore
            </Button>
          </Link>
        </div>

        <RetroGrid />
      </div>
    </div>
  );
}
