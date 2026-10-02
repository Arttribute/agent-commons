"use client";

import { create } from "zustand";

const OPEN_KEY = "commons.secondaryNavOpen";

function readOpen() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

type SecondaryNavState = {
  /** A section list (Library files, Projects) shown beside the main sidebar. */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The main sidebar, expanded over a section list. The two never both stay open. */
  mainExpanded: boolean;
  setMainExpanded: (expanded: boolean) => void;
};

export const useSecondaryNav = create<SecondaryNavState>((set) => ({
  open: readOpen(),
  setOpen: (open) => {
    try {
      window.localStorage.setItem(OPEN_KEY, String(open));
    } catch {
      // Remembering the choice is a convenience.
    }
    set(open ? { open, mainExpanded: false } : { open });
  },
  mainExpanded: false,
  setMainExpanded: (mainExpanded) =>
    set((state) => (mainExpanded ? { mainExpanded, open: false } : { mainExpanded, open: state.open })),
}));

/** Routes that show a section list beside a collapsed main sidebar. */
export function hasSecondaryNav(pathname: string) {
  return /^\/library\/[^/]+/.test(pathname) || /^\/projects\/[^/]+/.test(pathname);
}
