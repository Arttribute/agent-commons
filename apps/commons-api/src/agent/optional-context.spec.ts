import { optionalContext } from './optional-context';

describe('optional conversation context', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('does not hold a turn indefinitely when one optional source never responds', async () => {
    const unavailable = jest.fn();
    const result = Promise.all([
      optionalContext(Promise.resolve('available context'), '', unavailable),
      optionalContext(new Promise<string>(() => {}), 'summary unavailable', unavailable),
    ]);
    await jest.advanceTimersByTimeAsync(12_000);
    await expect(result).resolves.toEqual(['available context', 'summary unavailable']);
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(unavailable).toHaveBeenCalledWith('timeout');
    expect(jest.getTimerCount()).toBe(0);
  });
  it('handles a late rejection after timeout without changing the captured fallback', async () => {
    let reject!: (error: Error) => void;
    const unavailable = jest.fn();
    const result = optionalContext(new Promise<string>((_, fail) => { reject = fail; }), '', unavailable);
    await jest.advanceTimersByTimeAsync(12_000);
    await expect(result).resolves.toBe('');
    reject(new Error('late source failure'));
    await Promise.resolve();
    expect(unavailable).toHaveBeenCalledTimes(1);
  });
  it('returns source errors promptly and removes the deadline timer', async () => {
    const unavailable = jest.fn();
    await expect(optionalContext(Promise.reject(new Error('unavailable')), [], unavailable)).resolves.toEqual([]);
    expect(unavailable).toHaveBeenCalledWith('error');
    expect(jest.getTimerCount()).toBe(0);
  });
});
