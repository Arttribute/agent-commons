/**
 * A readable message from any error body the Commons API stack returns: Nest
 * (`{ message: string | string[] }`), the gateway (`{ error: { message } }`),
 * BFF routes (`{ error: string }`), or a bare string. Never returns
 * "[object Object]".
 */
export function apiErrorMessage(payload: unknown, fallback: string): string {
  return readMessage(payload, 0) || fallback;
}

function readMessage(value: unknown, depth: number): string {
  if (depth > 4 || value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((entry) => readMessage(entry, depth + 1))
      .filter(Boolean)
      .join(" ");
  }
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return (
    readMessage(record.message, depth + 1) ||
    readMessage(record.error, depth + 1) ||
    readMessage(record.detail, depth + 1) ||
    readMessage(record.reason, depth + 1)
  );
}
