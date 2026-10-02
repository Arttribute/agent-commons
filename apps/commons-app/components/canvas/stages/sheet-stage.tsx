"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CanvasAnnotation } from "@/lib/canvas";
import { cn } from "@/lib/utils";
import { noteTarget } from "../canvas-notes";
import { SelectionBubble, StageMessage, type StageProps } from "./stage-kit";

type Sheet = { name: string; rows: string[][] };
type Cell = { row: number; col: number };

const MAX_ROWS = 1000;

export function SheetStage({
  preview,
  notes,
  numberOf,
  focusedNoteId,
  canAnnotate,
  onDraft,
  onOpenNote,
  onViewer,
}: StageProps) {
  const sheets = useMemo(
    () => parseWorkbook(preview.content || preview.textPreview || "", preview.name),
    [preview.content, preview.name, preview.textPreview],
  );
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [focus, setFocus] = useState<Cell | null>(null);
  const [dragging, setDragging] = useState(false);
  const [bubble, setBubble] = useState<{ x: number; y: number } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const sheet = sheets[Math.min(active, sheets.length - 1)];

  useEffect(() => {
    if (sheet) onViewer({ sheet: sheet.name });
  }, [onViewer, sheet]);

  // Show the sheet and cells of a focused note.
  useEffect(() => {
    const note = notes.find((entry) => entry.annotationId === focusedNoteId);
    const target = note ? noteTarget(note) : undefined;
    if (target?.type !== "cells") return;
    const index = sheets.findIndex((entry) => entry.name === target.sheet);
    if (index >= 0) setActive(index);
    const start = parseRange(target.range)?.start;
    if (start) {
      window.setTimeout(() => {
        grid.current
          ?.querySelector(`[data-cell="${start.row}:${start.col}"]`)
          ?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      }, 60);
    }
  }, [focusedNoteId, notes, sheets]);

  const sheetNotes = useMemo(
    () =>
      notes.flatMap((note) => {
        const target = noteTarget(note);
        if (target?.type !== "cells" || target.sheet !== sheet?.name) return [];
        const range = parseRange(target.range);
        return range ? [{ note, range }] : [];
      }),
    [notes, sheet?.name],
  );

  if (!sheet) {
    return <StageMessage title="No cell preview is available" detail="Download the workbook to view it." />;
  }

  const columns = Math.max(1, ...sheet.rows.map((row) => row.length));
  const rows = sheet.rows.slice(0, MAX_ROWS);
  const selection = anchor && focus ? normalize(anchor, focus) : null;
  const noteAt = (row: number, col: number) =>
    sheetNotes.find(({ range }) => row >= range.start.row && row <= range.end.row && col >= range.start.col && col <= range.end.col)?.note;

  const finishSelection = (event: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    if (!canAnnotate || !selection) return;
    setBubble({ x: event.clientX, y: event.clientY + 12 });
  };

  const addNote = () => {
    if (!selection || !bubble) return;
    const values = sheet.rows
      .slice(selection.start.row, selection.end.row + 1)
      .slice(0, 50)
      .map((row) => {
        const cells: string[] = [];
        for (let col = selection.start.col; col <= Math.min(selection.end.col, selection.start.col + 25); col += 1) {
          cells.push(row[col] ?? "");
        }
        return cells;
      });
    onDraft({
      kind: "comment",
      target: {
        type: "cells",
        sheet: sheet.name,
        range: rangeLabel(selection.start, selection.end),
        values,
      },
      anchor: bubble,
    });
    setBubble(null);
  };

  return (
    <div className="flex h-full w-full flex-col px-4 pb-24 pt-16">
      <div
        ref={grid}
        className="min-h-0 flex-1 select-none overflow-auto overscroll-contain rounded-t-2xl border border-stone-200/80 bg-white shadow-card"
        onPointerUp={finishSelection}
        onPointerLeave={finishSelection}
      >
        <table className="border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 h-7 w-12 border-b border-r border-stone-200 bg-stone-50" />
              {Array.from({ length: columns }, (_, col) => (
                <th
                  key={col}
                  className={cn(
                    "sticky top-0 z-10 h-7 min-w-28 border-b border-r border-stone-200 bg-stone-50 px-2 text-center font-normal text-stone-500",
                    selection && col >= selection.start.col && col <= selection.end.col && "bg-stone-100 text-stone-900",
                  )}
                >
                  {columnName(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th
                  className={cn(
                    "sticky left-0 z-10 w-12 border-b border-r border-stone-200 bg-stone-50 px-2 text-right font-mono text-[10px] font-normal text-stone-400",
                    selection && rowIndex >= selection.start.row && rowIndex <= selection.end.row && "bg-stone-100 text-stone-900",
                  )}
                >
                  {rowIndex + 1}
                </th>
                {Array.from({ length: columns }, (_, col) => {
                  const note = noteAt(rowIndex, col);
                  const selected =
                    selection &&
                    rowIndex >= selection.start.row &&
                    rowIndex <= selection.end.row &&
                    col >= selection.start.col &&
                    col <= selection.end.col;
                  return (
                    <td
                      key={col}
                      data-cell={`${rowIndex}:${col}`}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        setBubble(null);
                        if (note && !event.shiftKey) {
                          const rect = event.currentTarget.getBoundingClientRect();
                          onOpenNote(note, { x: rect.right + 8, y: rect.top });
                          return;
                        }
                        const cell = { row: rowIndex, col };
                        if (event.shiftKey && anchor) setFocus(cell);
                        else {
                          setAnchor(cell);
                          setFocus(cell);
                        }
                        setDragging(true);
                      }}
                      onPointerEnter={() => {
                        if (dragging) setFocus({ row: rowIndex, col });
                      }}
                      className={cn(
                        "relative h-7 min-w-28 max-w-72 border-b border-r border-stone-100 px-2 align-top text-stone-700",
                        rowIndex === 0 && "font-medium text-stone-900",
                        note && (note.status === "resolved" ? "bg-stone-50" : "bg-amber-50"),
                        note?.annotationId === focusedNoteId && "bg-amber-100",
                        selected && "bg-sky-50 outline outline-1 -outline-offset-1 outline-sky-300",
                      )}
                    >
                      <span className="line-clamp-2 whitespace-pre-wrap py-1">{row[col] ?? ""}</span>
                      {note && <NoteCorner note={note} number={numberOf(note.annotationId)} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {sheet.rows.length > MAX_ROWS && (
          <p className="px-3 py-2 text-xs text-stone-500">Showing the first {MAX_ROWS} rows.</p>
        )}
      </div>
      {sheets.length > 1 && (
        <nav aria-label="Sheets" className="flex shrink-0 gap-0.5 overflow-x-auto rounded-b-2xl border border-t-0 border-stone-200/80 bg-white px-2 py-1.5 shadow-card">
          {sheets.map((entry, index) => (
            <button
              key={`${entry.name}-${index}`}
              type="button"
              onClick={() => {
                setActive(index);
                setAnchor(null);
                setFocus(null);
                setBubble(null);
              }}
              aria-current={index === active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-900",
                index === active && "bg-stone-100 font-medium text-stone-900",
              )}
            >
              {entry.name}
            </button>
          ))}
        </nav>
      )}
      {bubble && selection && <SelectionBubble anchor={bubble} onNote={addNote} />}
    </div>
  );
}

function NoteCorner({ note, number }: { note: CanvasAnnotation; number: number }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-bl-md px-1 text-[9px] font-medium text-white",
        note.status === "resolved" ? "bg-stone-400" : "bg-amber-500",
      )}
    >
      {number}
    </span>
  );
}

export function columnName(index: number) {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function rangeLabel(start: Cell, end: Cell) {
  const first = `${columnName(start.col)}${start.row + 1}`;
  const last = `${columnName(end.col)}${end.row + 1}`;
  return first === last ? first : `${first}:${last}`;
}

function parseRange(range: string) {
  const match = range.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  if (!match) return null;
  const column = (name: string) => [...name].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
  const start = { col: column(match[1]), row: Number(match[2]) - 1 };
  const end = match[3] ? { col: column(match[3]), row: Number(match[4]) - 1 } : start;
  return normalize(start, end);
}

function normalize(a: Cell, b: Cell) {
  return {
    start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
    end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
  };
}

/** Extracted workbook text is "## Sheet: name" sections of CSV. */
export function parseWorkbook(content: string, fileName: string): Sheet[] {
  const sections = content.split(/^## Sheet: /gm).map((part) => part.trim()).filter(Boolean);
  if (!/^## Sheet: /m.test(content)) {
    const rows = parseCsv(content);
    return rows.length ? [{ name: fileName.replace(/\.[^.]+$/, "") || "Sheet 1", rows }] : [];
  }
  return sections.map((part) => {
    const newline = part.indexOf("\n");
    return {
      name: newline >= 0 ? part.slice(0, newline).trim() : part,
      rows: parseCsv(newline >= 0 ? part.slice(newline + 1) : ""),
    };
  });
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}
