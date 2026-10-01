"use client";
import React from "react";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { FlagsProvider } from "@/components/providers/flags-provider";

type Props = {
  children: React.ReactNode;
  session: Session | null;
};

export default function Providers({ children, session }: Props) {
  return (
    <SessionProvider session={session}>
      <FlagsProvider>{children}</FlagsProvider>
    </SessionProvider>
  );
}
