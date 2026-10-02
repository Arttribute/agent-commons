"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  GripVertical,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChromeButton } from "./canvas-chrome";

const WIDTH = 320;

/**
 * A small floating card for writing or editing a note at the place it refers
 * to. It can be dragged out of the way by its handle.
 */
export function NoteEditor({
  anchor,
  number,
  location,
  quote,
  initialBody = "",
  saving,
  status,
  attached,
  allowEmpty,
  onSave,
  onClose,
  onAddToChat,
  onToggleResolved,
  onDelete,
}: {
  anchor: { x: number; y: number };
  number?: number;
  location?: string;
  quote?: string;
  initialBody?: string;
  saving?: boolean;
  status?: "open" | "resolved";
  attached?: boolean;
  /** Highlights may be saved without text. */
  allowEmpty?: boolean;
  onSave: (body: string) => void;
  onClose: () => void;
  onAddToChat?: () => void;
  onToggleResolved?: () => void;
  onDelete?: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(initialBody);
  const [position, setPosition] = useState(anchor);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const existing = number !== undefined;
  const dirty = body.trim() !== initialBody.trim();

  useEffect(() => setBody(initialBody), [initialBody]);

  // Keep the card on screen when it opens and after it is dragged.
  const onScreen = (point: { x: number; y: number }) => {
    const height = card.current?.offsetHeight ?? 180;
    return {
      x: Math.max(12, Math.min(point.x, window.innerWidth - WIDTH - 12)),
      y: Math.max(12, Math.min(point.y, window.innerHeight - height - 12)),
    };
  };
  useLayoutEffect(() => {
    setPosition(onScreen(anchor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  useEffect(() => {
    if (!existing) input.current?.focus();
  }, [existing]);

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [body]);

  const canSave = !saving && (Boolean(body.trim()) || (allowEmpty && !existing)) && (!existing || dirty);
  const save = () => {
    if (canSave) onSave(body.trim());
  };

  return (
    <div
      ref={card}
      role="dialog"
      aria-label={existing ? `Note ${number}` : "New note"}
      className="fixed z-50 rounded-2xl border border-stone-200 bg-white shadow-floating"
      style={{ left: position.x, top: position.y, width: WIDTH }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1 px-1.5 pt-1.5">
        <button
          type="button"
          aria-label="Move note"
          className="flex h-7 w-5 cursor-grab touch-none items-center justify-center rounded text-stone-300 hover:text-stone-500 active:cursor-grabbing"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { dx: event.clientX - position.x, dy: event.clientY - position.y };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            setPosition({ x: event.clientX - drag.current.dx, y: event.clientY - drag.current.dy });
          }}
          onPointerUp={() => {
            drag.current = null;
            setPosition((current) => onScreen(current));
          }}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {existing && (
          <span
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white",
              status === "resolved" ? "bg-stone-400" : "bg-stone-900",
            )}
          >
            {number}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-stone-500">{location}</span>
        {onAddToChat && (
          <ChromeButton label={attached ? "Added to chat" : "Add to chat"} onClick={onAddToChat} disabled={attached} active={attached}>
            <MessageSquarePlus />
          </ChromeButton>
        )}
        {onToggleResolved && (
          <ChromeButton label={status === "resolved" ? "Reopen" : "Resolve"} onClick={onToggleResolved}>
            {status === "resolved" ? <RotateCcw /> : <Check />}
          </ChromeButton>
        )}
        {onDelete && (
          <ChromeButton label="Delete note" onClick={onDelete}>
            <Trash2 />
          </ChromeButton>
        )}
        <ChromeButton label="Close" onClick={onClose}>
          <X />
        </ChromeButton>
      </div>
      {quote && (
        <p className="mx-3 mt-1 line-clamp-3 border-l-2 border-yellow-300 pl-2 text-xs leading-5 text-stone-500">
          {quote}
        </p>
      )}
      <div className="flex items-end gap-2 p-2 pl-3">
        <textarea
          ref={input}
          rows={1}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              save();
            }
          }}
          placeholder={allowEmpty && !existing ? "Add a note, or press Enter to highlight" : "Add a note"}
          aria-label="Note"
          className="max-h-[180px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-stone-900 outline-none placeholder:text-stone-400"
        />
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          aria-label={existing ? "Save note" : "Add note"}
          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white transition hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
