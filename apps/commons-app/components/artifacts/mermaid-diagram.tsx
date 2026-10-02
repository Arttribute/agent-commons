"use client";

import { forwardRef, useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

type Mermaid = typeof import("mermaid").default;
let mermaidPromise: Promise<Mermaid> | null = null;

function loadMermaid() {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      // Strict mode sanitizes labels and disables click handlers in diagrams.
      securityLevel: "strict",
      theme: "neutral",
      fontFamily: "inherit",
    });
    return mermaid;
  });
  return mermaidPromise;
}

/** Renders Mermaid source as an SVG diagram, or explains why it cannot. */
export const MermaidDiagram = forwardRef<
  HTMLDivElement,
  { source: string; className?: string; onRendered?: (svg: SVGSVGElement | null) => void }
>(function MermaidDiagram({ source, className, onRendered }, ref) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    loadMermaid()
      .then(async (mermaid) => {
        const result = await mermaid.render(`mermaid-${id}-${Date.now()}`, source.trim());
        if (!cancelled) setSvg(result.svg);
      })
      .catch((cause) => {
        if (cancelled) return;
        setSvg("");
        setError(cause instanceof Error ? cause.message.split("\n")[0] : "This diagram could not be drawn.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  useEffect(() => {
    if (!onRendered) return;
    const container = typeof ref === "object" ? ref?.current : null;
    onRendered(container?.querySelector("svg") ?? null);
  }, [onRendered, ref, svg]);

  if (error) {
    return (
      <div className={cn("w-full max-w-2xl rounded-xl border border-stone-200 bg-white p-4 text-left", className)}>
        <p className="text-sm font-medium text-stone-800">This diagram could not be drawn</p>
        <p className="mt-1 text-xs text-stone-500">{error}</p>
        <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-stone-50 p-3 font-mono text-[11px] leading-5 text-stone-600">
          {source}
        </pre>
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className={cn("mermaid-diagram [&_svg]:h-auto [&_svg]:max-w-full", !svg && "min-h-24 animate-pulse rounded-xl bg-stone-100", className)}
      // Mermaid output in strict mode is sanitized SVG.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});

/** Mermaid fenced blocks in Markdown. */
export function isMermaidFence(className?: string) {
  return /language-mermaid/.test(className ?? "");
}
