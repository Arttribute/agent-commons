/** Bound internal tool transport even if its underlying network call stalls. */
export function toolRequestTimeoutMs(name: string, args: Record<string, unknown>) {
  if (name === 'runPythonAnalysis' || name === 'writeComputerFiles') return 15 * 60_000;
  if (name === 'runComputerCommand') {
    const seconds = Number(args.timeoutSeconds ?? 120);
    return (Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 600)) : 120) * 1000 + 240_000;
  }
  if (/Computer/.test(name)) return 5 * 60_000;
  return 3 * 60_000;
}
