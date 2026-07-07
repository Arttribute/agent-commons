"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";

/**
 * Appearance system for the agent computer. The computer keeps its own look —
 * independent of the app's light/dark theme — defaulting to a clean light
 * desktop that matches Agent Commons, with dark and tinted alternatives. The
 * terminal is always dark; the code editor carries its own light/dark toggle.
 *
 * Preferences persist to localStorage and sync across every mounted surface
 * (the big panel and each inline mini computer) via a window event, so changing
 * the appearance in one place updates them all live.
 */

export type ComputerMode = "light" | "dark";
export type AppearanceId = "light" | "mist" | "sand" | "dark";
export type CodeTheme = "light" | "dark";

export type ComputerTokens = {
  /** Panel shell (root border + base surface + text). */
  panel: string;
  /** Top bar background + border. */
  topBar: string;
  text: string;
  textDim: string;
  /** Hairline border color class (border-*). */
  border: string;
  /** Vertical/horizontal divider fill (bg-*). */
  divider: string;
  chip: string;
  chipActive: string;
  switcherTrack: string;
  switcherIdle: string;
  switcherActive: string;
  iconBtn: string;
  iconBtnActive: string;
  /** Full-surface management views (computers / settings). */
  viewBg: string;
  toolbar: string;
  card: string;
  cardActive: string;
  input: string;
  toggleRow: string;
  /** Subtle inset surfaces — explorer / finder sidebars. */
  mutedPanel: string;
  /** Vignette laid over the wallpaper. */
  vignette: string;
};

export type Appearance = {
  id: AppearanceId;
  label: string;
  mode: ComputerMode;
  wallpaper: CSSProperties;
  /** Small preview swatch for the picker. */
  swatch: string;
};

/** Aurora wallpaper — zinc base with indigo/violet glow. */
const DARK_WALLPAPER: CSSProperties = {
  background: [
    "radial-gradient(120% 90% at 12% 0%, rgba(99,102,241,0.30), transparent 46%)",
    "radial-gradient(110% 80% at 88% 12%, rgba(168,85,247,0.18), transparent 52%)",
    "radial-gradient(100% 100% at 50% 105%, rgba(56,189,248,0.14), transparent 58%)",
    "#09090b",
  ].join(", "),
};

/** Clear sky — a calm sky-blue gradient fading to near-white at the horizon. */
const LIGHT_WALLPAPER: CSSProperties = {
  background: [
    "radial-gradient(130% 95% at 50% -12%, rgba(56,189,248,0.60), transparent 55%)",
    "radial-gradient(120% 85% at 85% 4%, rgba(59,130,246,0.32), transparent 52%)",
    "linear-gradient(180deg, #d6ecff 0%, #e7f4ff 45%, #f2f9ff 100%)",
  ].join(", "),
};

/** Cool morning mist — light blue-grey. */
const MIST_WALLPAPER: CSSProperties = {
  background: [
    "radial-gradient(120% 90% at 10% 0%, rgba(56,189,248,0.16), transparent 48%)",
    "radial-gradient(110% 85% at 90% 6%, rgba(129,140,248,0.14), transparent 52%)",
    "radial-gradient(100% 100% at 50% 108%, rgba(45,212,191,0.10), transparent 58%)",
    "#eef2f7",
  ].join(", "),
};

/** Warm sand — soft light with amber/rose warmth. */
const SAND_WALLPAPER: CSSProperties = {
  background: [
    "radial-gradient(120% 90% at 12% 0%, rgba(251,191,36,0.14), transparent 46%)",
    "radial-gradient(110% 85% at 88% 8%, rgba(251,146,120,0.12), transparent 52%)",
    "radial-gradient(100% 100% at 50% 108%, rgba(253,224,180,0.20), transparent 58%)",
    "#f7f4ef",
  ].join(", "),
};

export const APPEARANCES: Appearance[] = [
  {
    id: "light",
    label: "Sky",
    mode: "light",
    wallpaper: LIGHT_WALLPAPER,
    swatch: "linear-gradient(160deg, #7dd3fc, #bae6fd 50%, #e0f2fe)",
  },
  {
    id: "mist",
    label: "Mist",
    mode: "light",
    wallpaper: MIST_WALLPAPER,
    swatch: "linear-gradient(135deg, #e0f2fe, #eef2f7 55%, #dbeafe)",
  },
  {
    id: "sand",
    label: "Sand",
    mode: "light",
    wallpaper: SAND_WALLPAPER,
    swatch: "linear-gradient(135deg, #fef3c7, #f7f4ef 55%, #fee2d5)",
  },
  {
    id: "dark",
    label: "Graphite",
    mode: "dark",
    wallpaper: DARK_WALLPAPER,
    swatch: "linear-gradient(135deg, #4338ca, #09090b 60%, #7c3aed)",
  },
];

const LIGHT_TOKENS: ComputerTokens = {
  panel: "border-zinc-200 bg-white text-zinc-900",
  topBar: "border-zinc-200/80 bg-white/80",
  text: "text-zinc-800",
  textDim: "text-zinc-500",
  border: "border-zinc-200",
  divider: "bg-zinc-200",
  chip: "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100",
  chipActive: "border-indigo-300 bg-indigo-50 text-indigo-700",
  switcherTrack: "bg-zinc-100",
  switcherIdle: "text-zinc-500 hover:text-zinc-900",
  switcherActive: "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200",
  iconBtn: "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
  iconBtnActive: "bg-indigo-50 text-indigo-600",
  viewBg: "bg-zinc-50/60",
  toolbar: "border-zinc-200 bg-zinc-50/80",
  card: "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
  cardActive: "border-indigo-300 bg-indigo-50/70",
  input: "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400",
  toggleRow: "border-zinc-200 bg-white",
  mutedPanel: "border-zinc-200 bg-zinc-50",
  vignette: "bg-[radial-gradient(circle_at_bottom,rgba(255,255,255,0.45),transparent_55%)]",
};

const DARK_TOKENS: ComputerTokens = {
  panel: "border-zinc-800 bg-zinc-950 text-zinc-100",
  topBar: "border-white/[0.07] bg-zinc-900/70",
  text: "text-zinc-100",
  textDim: "text-zinc-400",
  border: "border-white/[0.07]",
  divider: "bg-white/10",
  chip: "border-white/5 bg-white/[0.03] text-zinc-100 hover:bg-white/[0.07]",
  chipActive: "border-indigo-400/40 bg-indigo-500/10 text-zinc-100",
  switcherTrack: "bg-black/30",
  switcherIdle: "text-zinc-400 hover:text-zinc-100",
  switcherActive: "bg-zinc-700/70 text-white shadow-sm",
  iconBtn: "text-zinc-400 hover:bg-white/10 hover:text-zinc-100",
  iconBtnActive: "bg-indigo-500/15 text-indigo-300",
  viewBg: "bg-zinc-950",
  toolbar: "border-white/[0.06] bg-zinc-900/60",
  card: "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
  cardActive: "border-indigo-400/40 bg-indigo-500/10",
  input: "border-white/10 bg-white/[0.03] text-zinc-100 placeholder:text-zinc-600",
  toggleRow: "border-white/[0.06] bg-white/[0.02]",
  mutedPanel: "border-white/[0.06] bg-zinc-900/50",
  vignette: "bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_60%)]",
};

export function tokensForMode(mode: ComputerMode): ComputerTokens {
  return mode === "dark" ? DARK_TOKENS : LIGHT_TOKENS;
}

const APPEARANCE_KEY = "computer:appearance";
const CODE_THEME_KEY = "computer:codeTheme";
const SYNC_EVENT = "computer-appearance-change";

function readAppearance(): AppearanceId {
  if (typeof window === "undefined") return "light";
  const value = window.localStorage.getItem(APPEARANCE_KEY);
  return APPEARANCES.some((a) => a.id === value) ? (value as AppearanceId) : "light";
}

function readCodeTheme(): CodeTheme {
  if (typeof window === "undefined") return "dark";
  const value = window.localStorage.getItem(CODE_THEME_KEY);
  return value === "light" ? "light" : "dark";
}

export type UseComputerTheme = {
  appearanceId: AppearanceId;
  appearance: Appearance;
  mode: ComputerMode;
  wallpaper: CSSProperties;
  tokens: ComputerTokens;
  codeTheme: CodeTheme;
  setAppearance: (id: AppearanceId) => void;
  setCodeTheme: (theme: CodeTheme) => void;
};

export function useComputerTheme(): UseComputerTheme {
  const [appearanceId, setAppearanceId] = useState<AppearanceId>("light");
  const [codeTheme, setCodeThemeState] = useState<CodeTheme>("dark");

  useEffect(() => {
    setAppearanceId(readAppearance());
    setCodeThemeState(readCodeTheme());
    const sync = () => {
      setAppearanceId(readAppearance());
      setCodeThemeState(readCodeTheme());
    };
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setAppearance = useCallback((id: AppearanceId) => {
    setAppearanceId(id);
    try {
      window.localStorage.setItem(APPEARANCE_KEY, id);
    } catch {
      /* storage may be unavailable */
    }
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  const setCodeTheme = useCallback((theme: CodeTheme) => {
    setCodeThemeState(theme);
    try {
      window.localStorage.setItem(CODE_THEME_KEY, theme);
    } catch {
      /* storage may be unavailable */
    }
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  const appearance = APPEARANCES.find((a) => a.id === appearanceId) ?? APPEARANCES[0];

  return {
    appearanceId,
    appearance,
    mode: appearance.mode,
    wallpaper: appearance.wallpaper,
    tokens: tokensForMode(appearance.mode),
    codeTheme,
    setAppearance,
    setCodeTheme,
  };
}
