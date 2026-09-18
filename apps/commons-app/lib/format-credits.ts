const UNITS = [
  { value: 1e12, suffix: "T" },
  { value: 1e9, suffix: "B" },
  { value: 1e6, suffix: "M" },
  { value: 1e3, suffix: "K" },
];

/**
 * Short credit amount for tight UI: exact below 10,000, compact above
 * (12.3K, 1.2M, 4B). Rounds toward zero so a balance is never overstated.
 */
export function formatCredits(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  if (abs < 10_000) return sign + Math.trunc(abs).toLocaleString("en-US");

  const unit = UNITS.find((u) => abs >= u.value)!;
  const scaled = abs / unit.value;
  const digits = scaled < 100 ? 1 : 0;
  const factor = 10 ** digits;
  const truncated = Math.trunc(scaled * factor) / factor;
  return `${sign}${truncated.toFixed(digits).replace(/\.0$/, "")}${unit.suffix}`;
}

/** Full amount with separators, for tooltips and screen readers. */
export function formatCreditsExact(amount: number): string {
  return Math.trunc(amount).toLocaleString("en-US");
}
