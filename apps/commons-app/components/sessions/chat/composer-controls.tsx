"use client";

import type { ComponentProps } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils";

export function ComposerTextArea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn("h-16 w-full resize-none rounded-2xl bg-transparent p-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none", className)} />;
}

export function ComposerSendButton({ busy = false, className, ...props }: ComponentProps<"button"> & { busy?: boolean }) {
  return <button {...props} type={props.type ?? "button"} className={cn("rounded-lg bg-foreground p-1.5 text-background transition-opacity hover:opacity-80 disabled:opacity-40", className)}>
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
  </button>;
}
