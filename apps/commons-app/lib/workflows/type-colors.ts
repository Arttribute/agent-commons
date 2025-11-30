export const TYPE_COLORS = {
  text: "#3b82f6", // Blue
  string: "#3b82f6", // Blue (alias for text)
  number: "#10b981", // Green
  integer: "#10b981", // Green (alias for number)
  boolean: "#f59e0b", // Amber
  object: "#8b5cf6", // Purple
  array: "#ec4899", // Pink
  base64: "#06b6d4", // Cyan
  url: "#14b8a6", // Teal
  any: "#6b7280", // Gray
} as const;

export type DataType = keyof typeof TYPE_COLORS;

/**
 * Get the color for an edge based on source and target types
 */
export function getEdgeColor(
  sourceType: string,
  targetType: string = "any"
): string {
  // Use source type for color
  const normalizedType = sourceType.toLowerCase();
  return (
    TYPE_COLORS[normalizedType as DataType] ||
    TYPE_COLORS.any
  );
}

/**
 * Validate if source and target types are compatible
 */
export function validateTypeCompatibility(
  sourceType: string,
  targetType: string
): boolean {
  const source = sourceType.toLowerCase();
  const target = targetType.toLowerCase();

  // 'any' accepts anything
  if (target === "any") return true;

  // Same types are compatible
  if (source === target) return true;

  // Aliases
  if (source === "string" && target === "text") return true;
  if (source === "text" && target === "string") return true;
  if (source === "integer" && target === "number") return true;
  if (source === "number" && target === "integer") return true;

  // Text can convert to most types
  if (
    (source === "text" || source === "string") &&
    ["url", "base64"].includes(target)
  ) {
    return true;
  }

  // URL can be treated as text
  if (source === "url" && (target === "text" || target === "string")) {
    return true;
  }

  return false;
}

/**
 * Get handle style based on type
 */
export function getHandleStyle(type: string): React.CSSProperties {
  return {
    background: getEdgeColor(type),
    width: 10,
    height: 10,
    border: "2px solid white",
  };
}
