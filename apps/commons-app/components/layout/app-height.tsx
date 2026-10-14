"use client";

import { useEffect } from "react";

/**
 * Keeps `--app-height` equal to the visible viewport. Android resizes the
 * layout for the keyboard on its own (`interactive-widget=resizes-content`);
 * iOS only shrinks the visual viewport, so app surfaces read this variable to
 * keep a bottom composer above the keyboard instead of behind it.
 */
export function AppHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Pinch zoom also shrinks the visual viewport; only follow the keyboard.
        if (viewport.scale > 1.01) return root.style.removeProperty("--app-height");
        root.style.setProperty("--app-height", `${Math.round(viewport.height)}px`);
        // iOS scrolls the page to reveal a focused field. The surface already
        // fits the visible area, so keep it anchored to the top.
        if (window.scrollY !== 0 && viewport.height < window.innerHeight) window.scrollTo(0, 0);
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--app-height");
    };
  }, []);
  return null;
}
