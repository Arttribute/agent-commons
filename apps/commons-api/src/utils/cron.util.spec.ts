import { parseCronExpression, intervalToCron } from './cron.util';

describe('parseCronExpression()', () => {
  it('returns a future Date for a valid cron expression', () => {
    const result = parseCronExpression('* * * * *');
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns a date roughly 1 minute ahead for "* * * * *"', () => {
    const before = Date.now();
    const result = parseCronExpression('* * * * *');
    const diffMs = result.getTime() - before;
    // Should fire within the next 60 seconds
    expect(diffMs).toBeGreaterThan(0);
    expect(diffMs).toBeLessThanOrEqual(60_001);
  });

  it('throws for an invalid expression', () => {
    expect(() => parseCronExpression('not a cron')).toThrow();
  });
});

describe('intervalToCron()', () => {
  it('generates per-second expression for intervals < 60s', () => {
    expect(intervalToCron(30)).toBe('*/30 * * * * *');
    expect(intervalToCron(5)).toBe('*/5 * * * * *');
  });

  it('generates per-minute expression for intervals 60s–3599s', () => {
    expect(intervalToCron(60)).toBe('0 */1 * * * *');
    expect(intervalToCron(300)).toBe('0 */5 * * * *');
  });

  it('generates per-hour expression for exact-hour intervals', () => {
    expect(intervalToCron(3600)).toBe('0 0 */1 * * *');
    expect(intervalToCron(7200)).toBe('0 0 */2 * * *');
  });

  it('throws for out-of-range intervals', () => {
    expect(() => intervalToCron(4)).toThrow();
    expect(() => intervalToCron(86_401)).toThrow();
  });
});
