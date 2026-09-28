"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A small "?" that reveals a short explanation on click. Keeps secondary
 * detail out of the layout until someone asks for it.
 */
export function InfoHint({ children, className, label = "More information" }: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn("inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground", className)}
          onClick={(event) => event.stopPropagation()}
        >
          <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 p-3 text-xs leading-5 text-muted-foreground">
        {children}
      </PopoverContent>
    </Popover>
  );
}
