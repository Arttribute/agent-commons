/**
 * Convert an interval in seconds (5 – 86 400) to a pg_cron 6‑field expression.
 */
export function intervalToCron(intervalSec: number): string {
  if (intervalSec < 5 || intervalSec > 86_400) {
    throw new Error('intervalSec must be between 5s and 86400s (24h)');
  }

  if (intervalSec < 60) {
    // every N seconds
    return `*/${intervalSec} * * * * *`;
  }

  if (intervalSec % 60 === 0 && intervalSec < 3_600) {
    // every N minutes
    const minutes = intervalSec / 60;
    return `0 */${minutes} * * * *`;
  }

  if (intervalSec % 3_600 === 0) {
    // every N hours
    const hours = intervalSec / 3_600;
    return `0 0 */${hours} * * *`;
  }

  // fallback
  return `*/${intervalSec} * * * * *`;
}
