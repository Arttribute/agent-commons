"use client";
import { ReactNode, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

interface Props {
  children: ReactNode;
}

/**
 * GlobalDataProvider preloads and keeps core collections relatively fresh.
 * It sets up an interval revalidation and one-off initial loads.
 */
export function GlobalDataProvider({ children }: Props) {
  // No global store preloading; components fetch as needed now
  useAuth(); // retain potential auth side-effects
  return <>{children}</>;
}
