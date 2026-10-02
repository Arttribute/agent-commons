"use client";

import { useRef, useState, type ReactNode } from "react";
import { GripVertical, MapPin, MousePointer2, SquareDashed, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteTool } from "./canvas-notes";

export type PaletteAction = { id: string; label: string; icon: LucideIcon; onRun: () => void };

/**
 * The floating tool strip at the bottom of the canvas. Shows only the tools
 * that make sense for the file on screen, and can be dragged aside.
 */
export function NotePalette({
  tool,
  tools,
  hint,
  actions = [],
  onTool,
}: {
  tool: NoteTool;
  tools: NoteTool[];
  hint?: string;
  actions?: PaletteAction[];
  onTool: (tool: NoteTool) => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  if (!tools.length && !actions.length && !hint) return null;

  const items: Array<{ id: NoteTool; label: string; icon: LucideIcon }> = [
    { id: "interact", label: "Select", icon: MousePointer2 },
    { id: "point", label: "Pin a note", icon: MapPin },
    { id: "region", label: "Mark an area", icon: SquareDashed },
  ];

  return (
    <div
      className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-stone-200/80 bg-white/95 p-1 shadow-floating backdrop-blur"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      <button
        type="button"
        aria-label="Move tools"
        className="flex h-8 w-5 cursor-grab touch-none items-center justify-center text-stone-300 hover:text-stone-500 active:cursor-grabbing"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setOffset({
            x: drag.current.ox + event.clientX - drag.current.x,
            y: Math.min(0, drag.current.oy + event.clientY - drag.current.y),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onDoubleClick={() => setOffset({ x: 0, y: 0 })}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {items
        .filter((item) => tools.includes(item.id))
        .map(({ id, label, icon: Icon }) => (
          <PaletteButton key={id} active={tool === id} onClick={() => onTool(tool === id && id !== "interact" ? "interact" : id)}>
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            <span>{label}</span>
          </PaletteButton>
        ))}
      {hint && tools.length <= 1 && <span className="px-2 text-xs text-stone-500">{hint}</span>}
      {actions.length > 0 && (tools.length > 0 || hint) && <span className="mx-1 h-5 w-px bg-stone-200" aria-hidden />}
      {actions.map(({ id, label, icon: Icon, onRun }) => (
        <PaletteButton key={id} onClick={onRun}>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
          <span>{label}</span>
        </PaletteButton>
      ))}
    </div>
  );
}

function PaletteButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900",
        active && "bg-stone-900 text-white hover:bg-stone-800 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
