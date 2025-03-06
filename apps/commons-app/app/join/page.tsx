"use client";
import React from "react";
import { RetroGrid } from "@/components/magicui/retro-grid";
import { Button } from "@/components/ui/button";
import AppBar from "@/components/layout/AppBar";
import Link from "next/link";
import { Bot, DollarSign, Network, Package, Search, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";

export default function Home() {
  return (
    <div>
      <AppBar />
      <div className="relative flex h-[600px] w-full flex-col overflow-hidden  items-center rounded-lg bg-background">
        <div className="container max-w-6xl grid grid-cols-12 mt-12 h-full items-center z-10 gap-8">
          Join the Commons
        </div>
      </div>
    </div>
  );
}
