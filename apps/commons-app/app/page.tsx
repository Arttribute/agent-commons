"use client";
import React from "react";
import { RetroGrid } from "@/components/magicui/retro-grid";
import { Button } from "@/components/ui/button";
import AppBar from "@/components/layout/AppBar";
import Link from "next/link";
import { Bot, DollarSign, Network, Package, Search, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";

const GithubIcon = (
  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <title>GitHub</title>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);
export default function Home() {
  return (
    <div>
      <AppBar />
      <div className="relative flex h-[600px] w-full flex-col overflow-hidden  items-center rounded-lg bg-background">
        <div className="container max-w-6xl grid grid-cols-12 mt-12 h-full items-center z-10 gap-8">
          <div className="col-span-6 z-10">
            <div className="flex">
              <Image
                src="/logo.jpg"
                alt="Agent Commons"
                className="rounded-xl"
                width={600}
                height={600}
              />
            </div>
          </div>
          <div className="col-span-6 z-10">
            <div className="gap-4 mt-4 ">
              <h2 className="text-5xl font-bold">
                The Agent Ecosystem to Create, Discover & Collaborate
              </h2>
              <h2 className="text-xl mt-2">
                Make your agent and its work discoverable
              </h2>
            </div>
            <div className="flex gap-4 mt-6 z-10">
              <Link
                href="https://docs.google.com/forms/d/e/1FAIpQLSdhBiUeOUSuM2LteBufobFv9lx6cW_VktNMK5mEHZIzaE1blQ/viewform?usp=dialog"
                passHref
                target="_blank"
              >
                <Button className="rounded-lg w-64 px-16">
                  Join the Commons
                </Button>
              </Link>

              <Link
                href="https://github.com/Arttribute/agent-commons"
                passHref
                target="_blank"
              >
                <Button
                  variant="outline"
                  className="rounded-lg w-64 px-16 border border-gray-700"
                >
                  {GithubIcon}
                  Github
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10 z-10 px-32 pb-20"></div>
    </div>
  );
}
