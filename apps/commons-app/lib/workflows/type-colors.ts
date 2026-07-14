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
  return getTypeCompatibility(sourceType, targetType).compatible;
}

export type TypeCompatibility = {
  compatible: boolean;
  mode: "exact" | "dynamic" | "coerce" | "incompatible";
  message?: string;
};

/**
 * Workflow wires describe runtime mappings, so `any` is a dynamic value rather
 * than an error. JSON values also have a small, explicit set of safe coercions;
 * the executor applies the same rules before invoking the target node.
 */
export function getTypeCompatibility(
  sourceType: string,
  targetType: string
): TypeCompatibility {
  const source = sourceType.toLowerCase();
  const target = targetType.toLowerCase();

  if (source === "any" || target === "any") {
    return {
      compatible: true,
      mode: "dynamic",
      message: target === "any" ? "Value passes through as-is" : `Value is resolved as ${target} at runtime`,
    };
  }

  // Same types are compatible
  if (source === target) return { compatible: true, mode: "exact" };

  // Aliases
  if (source === "string" && target === "text") return { compatible: true, mode: "exact" };
  if (source === "text" && target === "string") return { compatible: true, mode: "exact" };
  if (source === "integer" && target === "number") return { compatible: true, mode: "exact" };
  if (source === "number" && target === "integer") return { compatible: true, mode: "coerce" };

  // Text can convert to most types
  if (
    (source === "text" || source === "string") &&
    ["url", "base64"].includes(target)
  ) {
    return { compatible: true, mode: "coerce", message: `Converted to ${target}` };
  }

  // URL can be treated as text
  if (source === "url" && (target === "text" || target === "string")) {
    return { compatible: true, mode: "coerce", message: "Converted to string" };
  }

  // Explicit JSON coercions. Object/array → string uses JSON serialization;
  // string → structured values uses JSON parsing and fails with a clear runtime
  // error if the value is malformed.
  const coercible =
    target === "string" ||
    target === "text" ||
    (source === "string" && ["number", "boolean", "object", "array"].includes(target)) ||
    (source === "number" && target === "boolean") ||
    (source === "boolean" && target === "number");

  if (coercible) {
    return { compatible: true, mode: "coerce", message: `Converted from ${source} to ${target}` };
  }

  return { compatible: false, mode: "incompatible" };
}

/**
 * Get handle style based on type
 */
export function getHandleStyle(type: string): React.CSSProperties {
  return {
    background: getEdgeColor(type),
    width: 11,
    height: 11,
    border: "2px solid hsl(var(--background))",
    boxShadow: "0 0 0 1px rgb(0 0 0 / 0.08)",
  };
}
