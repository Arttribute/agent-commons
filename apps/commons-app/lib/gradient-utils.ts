/**
 * Shared gradient utilities for deterministic, multi-color backgrounds.
 */

// Keep shades <= 300 for avatars, but allow more intense gradients for space cards
export const multiColorGradients = [
  "bg-gradient-to-r from-red-200 via-yellow-200 to-green-200",
  "bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200",
  "bg-gradient-to-r from-indigo-200 via-fuchsia-200 to-orange-200",
  "bg-gradient-to-r from-teal-200 via-green-200 to-lime-200",
  "bg-gradient-to-r from-rose-200 via-pink-200 to-purple-200",
  "bg-gradient-to-r from-cyan-200 via-sky-200 to-blue-200",
  "bg-gradient-to-r from-violet-200 via-purple-200 to-fuchsia-200",
  "bg-gradient-to-r from-emerald-200 via-green-200 to-lime-200",
  "bg-gradient-to-r from-amber-200 via-yellow-200 to-lime-200",
  "bg-gradient-to-r from-red-300 via-yellow-300 to-green-300",
  "bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300",
  "bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-orange-300",
  "bg-gradient-to-r from-teal-300 via-green-300 to-lime-300",
  "bg-gradient-to-r from-rose-300 via-pink-300 to-purple-300",
  "bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-300",
  "bg-gradient-to-r from-violet-300 via-purple-300 to-fuchsia-300",
  "bg-gradient-to-r from-emerald-300 via-green-300 to-lime-300",
  "bg-gradient-to-r from-amber-300 via-yellow-300 to-lime-300",
  "bg-gradient-to-l from-red-200 via-yellow-200 to-green-200",
  "bg-gradient-to-l from-blue-200 via-purple-200 to-pink-200",
  "bg-gradient-to-l from-indigo-200 via-fuchsia-200 to-orange-200",
  "bg-gradient-to-l from-teal-200 via-green-200 to-lime-200",
  "bg-gradient-to-l from-rose-200 via-pink-200 to-purple-200",
  "bg-gradient-to-l from-cyan-200 via-sky-200 to-blue-200",
  "bg-gradient-to-l from-violet-200 via-purple-200 to-fuchsia-200",
  "bg-gradient-to-l from-emerald-200 via-green-200 to-lime-200",
  "bg-gradient-to-l from-amber-200 via-yellow-200 to-lime-200",
  "bg-gradient-to-l from-red-300 via-yellow-300 to-green-300",
  "bg-gradient-to-l from-blue-300 via-purple-300 to-pink-300",
  "bg-gradient-to-l from-indigo-300 via-fuchsia-300 to-orange-300",
  "bg-gradient-to-l from-teal-300 via-green-300 to-lime-300",
  "bg-gradient-to-l from-rose-300 via-pink-300 to-purple-300",
  "bg-gradient-to-l from-cyan-300 via-sky-300 to-blue-300",
  "bg-gradient-to-l from-violet-300 via-purple-300 to-fuchsia-300",
  "bg-gradient-to-l from-emerald-300 via-green-300 to-lime-300",
  "bg-gradient-to-l from-amber-300 via-yellow-300 to-lime-300",
  "bg-gradient-to-t from-red-200 via-yellow-200 to-green-200",
  "bg-gradient-to-t from-blue-200 via-purple-200 to-pink-200",
  "bg-gradient-to-t from-indigo-200 via-fuchsia-200 to-orange-200",
  "bg-gradient-to-t from-teal-200 via-green-200 to-lime-200",
  "bg-gradient-to-t from-rose-200 via-pink-200 to-purple-200",
  "bg-gradient-to-t from-cyan-200 via-sky-200 to-blue-200",
  "bg-gradient-to-t from-violet-200 via-purple-200 to-fuchsia-200",
  "bg-gradient-to-t from-emerald-200 via-green-200 to-lime-200",
  "bg-gradient-to-t from-amber-200 via-yellow-200 to-lime-200",
  "bg-gradient-to-t from-red-300 via-yellow-300 to-green-300",
  "bg-gradient-to-t from-blue-300 via-purple-300 to-pink-300",
  "bg-gradient-to-t from-indigo-300 via-fuchsia-300 to-orange-300",
  "bg-gradient-to-t from-teal-300 via-green-300 to-lime-300",
  "bg-gradient-to-t from-rose-300 via-pink-300 to-purple-300",
  "bg-gradient-to-t from-cyan-300 via-sky-300 to-blue-300",
  "bg-gradient-to-t from-violet-300 via-purple-300 to-fuchsia-300",
  "bg-gradient-to-t from-emerald-300 via-green-300 to-lime-300",
  "bg-gradient-to-t from-amber-300 via-yellow-300 to-lime-300",
  "bg-gradient-to-b from-red-200 via-yellow-200 to-green-200",
  "bg-gradient-to-b from-blue-200 via-purple-200 to-pink-200",
  "bg-gradient-to-b from-indigo-200 via-fuchsia-200 to-orange-200",
  "bg-gradient-to-b from-teal-200 via-green-200 to-lime-200",
  "bg-gradient-to-b from-rose-200 via-pink-200 to-purple-200",
  "bg-gradient-to-b from-cyan-200 via-sky-200 to-blue-200",
  "bg-gradient-to-b from-violet-200 via-purple-200 to-fuchsia-200",
  "bg-gradient-to-b from-emerald-200 via-green-200 to-lime-200",
  "bg-gradient-to-b from-amber-200 via-yellow-200 to-lime-200",
  "bg-gradient-to-b from-red-300 via-yellow-300 to-green-300",
  "bg-gradient-to-b from-blue-300 via-purple-300 to-pink-300",
  "bg-gradient-to-b from-indigo-300 via-fuchsia-300 to-orange-300",
  "bg-gradient-to-b from-teal-300 via-green-300 to-lime-300",
  "bg-gradient-to-b from-rose-300 via-pink-300 to-purple-300",
  "bg-gradient-to-b from-cyan-300 via-sky-300 to-blue-300",
  "bg-gradient-to-b from-violet-300 via-purple-300 to-fuchsia-300",
  "bg-gradient-to-b from-emerald-300 via-green-300 to-lime-300",
  "bg-gradient-to-b from-amber-300 via-yellow-300 to-lime-300",
];

// More intense gradients for space cards using CSS colors
export const intenseGradients = [
  { from: "#f87171", via: "#f97316", to: "#fbbf24" }, // red-orange-yellow
  { from: "#3b82f6", via: "#a855f7", to: "#ec4899" }, // blue-purple-pink
  { from: "#6366f1", via: "#c026d3", to: "#f97316" }, // indigo-fuchsia-orange
  { from: "#14b8a6", via: "#34d399", to: "#84cc16" }, // teal-emerald-lime
  { from: "#f43f5e", via: "#f472b6", to: "#a855f7" }, // rose-pink-purple
  { from: "#06b6d4", via: "#38bdf8", to: "#3b82f6" }, // cyan-sky-blue
  { from: "#8b5cf6", via: "#a855f7", to: "#c026d3" }, // violet-purple-fuchsia
  { from: "#10b981", via: "#22c55e", to: "#14b8a6" }, // emerald-green-teal
  { from: "#f59e0b", via: "#fbbf24", to: "#f97316" }, // amber-yellow-orange
  { from: "#ef4444", via: "#ec4899", to: "#a855f7" }, // red-pink-purple
  { from: "#60a5fa", via: "#6366f1", to: "#8b5cf6" }, // blue-indigo-violet
  { from: "#22c55e", via: "#14b8a6", to: "#06b6d4" }, // green-teal-cyan
  { from: "#c026d3", via: "#a855f7", to: "#6366f1" }, // fuchsia-purple-indigo
  { from: "#f97316", via: "#ef4444", to: "#ec4899" }, // orange-red-pink
  { from: "#84cc16", via: "#22c55e", to: "#10b981" }, // lime-green-emerald
  { from: "#0ea5e9", via: "#3b82f6", to: "#6366f1" }, // sky-blue-indigo
];

export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export function getGradientForKey(key: string): string {
  const idx = hashCode(key || "default") % multiColorGradients.length;
  return multiColorGradients[idx];
}

export function getIntenseGradientForKey(key: string) {
  const idx = hashCode(key || "default") % intenseGradients.length;
  return intenseGradients[idx];
}

/**
 * Generate deterministic geometric shapes for a given key
 */
export interface GeometricShape {
  type: "circle" | "square" | "triangle";
  size: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
}

export function getShapesForKey(key: string, count: number = 3): GeometricShape[] {
  const hash = hashCode(key || "default");
  const shapes: GeometricShape[] = [];

  // Use different parts of the hash for different properties
  for (let i = 0; i < count; i++) {
    const seed = hash + i * 1000;
    const shapeTypes: Array<"circle" | "square" | "triangle"> = ["circle", "square", "triangle"];

    shapes.push({
      type: shapeTypes[seed % 3],
      size: 20 + (seed % 40), // 20-60px
      x: (seed * 7) % 100, // 0-100%
      y: (seed * 13) % 100, // 0-100%
      rotation: (seed * 17) % 360, // 0-360deg
      opacity: 0.15 + ((seed % 10) / 100), // 0.15-0.25
    });
  }

  return shapes;
}
