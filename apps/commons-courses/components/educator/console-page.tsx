import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Content frame for console pages outside a course. */
export function ConsolePage({
  children,
  width = "default",
}: {
  children: ReactNode;
  width?: "default" | "narrow";
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-6 sm:px-6 lg:px-8", width === "narrow" ? "max-w-3xl" : "max-w-6xl")}>
      {children}
    </div>
  );
}
