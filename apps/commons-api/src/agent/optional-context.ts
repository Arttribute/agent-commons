/** Optional prompt enrichment must not prevent an authenticated turn starting. */
export function optionalContext<T>(
  work: PromiseLike<T>,
  fallback: T,
  onUnavailable: (reason: 'timeout' | 'error') => void,
  timeoutMs = 12_000,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T, reason?: 'timeout' | 'error') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (reason) onUnavailable(reason);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback, 'timeout'), timeoutMs);
    Promise.resolve(work).then((value) => finish(value), () => finish(fallback, 'error'));
  });
}
