"use client";

import { PanelLeftOpen } from "lucide-react";
import { ChromeButton, ChromeGroup } from "@/components/canvas/canvas-chrome";
import { useSecondaryNav } from "@/stores/secondary-nav-store";

/** Brings back the file list after it was hidden. */
export function LibraryNavToggle() {
  const open = useSecondaryNav((state) => state.open);
  const setOpen = useSecondaryNav((state) => state.setOpen);
  if (open) return null;
  return (
    <ChromeGroup className="hidden md:flex">
      <ChromeButton label="Show file list" onClick={() => setOpen(true)}>
        <PanelLeftOpen />
      </ChromeButton>
    </ChromeGroup>
  );
}
