"use client";

import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

const storageKey = "commonlab-recent-colors";

const defaultColors = [
  "#B8F56D",
  "#71E0E7",
  "#38BDF8",
  "#FACC15",
  "#FB923C",
  "#F472B6",
  "#A78BFA",
  "#94A3B8",
  "#111827",
  "#FFFFFF",
];

export function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  const normalizedValue = normalizeColor(value) || defaultColors[0];
  const [open, setOpen] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [typedColor, setTypedColor] = useState(normalizedValue);

  useEffect(() => {
    setTypedColor(normalizedValue);
  }, [normalizedValue]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "[]") as string[];
      setRecentColors(stored.map(normalizeColor).filter(Boolean).slice(0, 8));
    } catch {
      setRecentColors([]);
    }
  }, []);

  function choose(color: string) {
    const nextColor = normalizeColor(color);
    if (!nextColor) return;

    onChange(nextColor);
    setTypedColor(nextColor);
    setRecentColors((current) => {
      const next = [nextColor, ...current.filter((item) => item !== nextColor)].slice(0, 8);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="relative">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mt-2 flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="h-6 w-6 shrink-0 rounded-full border border-slate-200"
            style={{ backgroundColor: normalizedValue }}
          />
          <span className="truncate">{normalizedValue}</span>
        </span>
        <Palette className="h-4 w-4 text-slate-400" />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          {recentColors.length > 0 ? (
            <>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Recent
              </p>
              <SwatchGrid colors={recentColors} value={normalizedValue} onChoose={choose} />
              <div className="my-3 h-px bg-slate-100" />
            </>
          ) : null}

          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Solid colors
          </p>
          <SwatchGrid colors={defaultColors} value={normalizedValue} onChoose={choose} />

          <div className="mt-3 grid grid-cols-[44px_1fr] gap-2">
            <label className="flex h-10 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
              <input
                type="color"
                value={normalizedValue}
                onChange={(event) => choose(event.target.value)}
                className="h-8 w-8 cursor-pointer rounded-full border-0 bg-transparent p-0"
                aria-label="Choose custom color"
              />
            </label>
            <input
              value={typedColor}
              onChange={(event) => setTypedColor(event.target.value)}
              onBlur={() => choose(typedColor)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  choose(typedColor);
                }
              }}
              placeholder="#B8F56D"
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold uppercase outline-none focus:border-slate-400"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SwatchGrid({
  colors,
  value,
  onChoose,
}: {
  colors: string[];
  value: string;
  onChoose: (color: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {colors.map((color) => {
        const selected = color.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChoose(color)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-105",
              selected ? "border-slate-950" : "border-slate-200"
            )}
            style={{ backgroundColor: color }}
            aria-label={`Choose ${color}`}
          >
            {selected ? (
              <Check
                className={cn(
                  "h-3.5 w-3.5",
                  isLightColor(color) ? "text-slate-950" : "text-white"
                )}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function normalizeColor(value?: string | null) {
  const color = value?.trim();
  if (!color) return "";
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color
      .slice(1)
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  return "";
}

function isLightColor(color: string) {
  const normalized = normalizeColor(color);
  if (!normalized) return false;
  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150;
}
