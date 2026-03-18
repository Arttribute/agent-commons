import { CronExpressionParser } from 'cron-parser';

/**
 * Given a cron expression, returns the next Date it should fire.
 * Uses cron-parser library.
 */
export function parseCronExpression(expression: string): Date {
  const interval = CronExpressionParser.parse(expression, { tz: 'UTC' });
  return interval.next().toDate();
}

/**
 * Convert an interval in seconds (5 - 86400) to a pg_cron 6-field expression.
 */
export function intervalToCron(intervalSec: number): string {
  if (intervalSec < 5 || intervalSec > 86_400) {
    throw new Error('intervalSec must be between 5s and 86400s (24h)');
  }

  if (intervalSec < 60) {
    // every N seconds
    return `*/${intervalSec} * * * * *`;
  }

  if (intervalSec < 3_600) {
    // Round up to nearest minute (minimum 1)
    const minutes = Math.max(1, Math.round(intervalSec / 60));
    return `0 */${minutes} * * * *`;
  }

  if (intervalSec % 3_600 === 0) {
    const hours = intervalSec / 3_600;
    return `0 0 */${hours} * * *`;
  }

  // Round to nearest hour
  const hours = Math.max(1, Math.round(intervalSec / 3_600));
  return `0 0 */${hours} * * *`;
}
