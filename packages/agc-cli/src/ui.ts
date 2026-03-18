import chalk from 'chalk';
import ora, { Ora } from 'ora';

// ── Colors & symbols ──────────────────────────────────────────────────────────

export const c = {
  primary:  (s: string) => chalk.cyan(s),
  success:  (s: string) => chalk.green(s),
  warn:     (s: string) => chalk.yellow(s),
  error:    (s: string) => chalk.red(s),
  dim:      (s: string) => chalk.dim(s),
  bold:     (s: string) => chalk.bold(s),
  id:       (s: string) => chalk.magenta(s),
  label:    (s: string) => chalk.cyan.bold(s),
};

export const sym = {
  ok:     chalk.green('✓'),
  fail:   chalk.red('✗'),
  arrow:  chalk.cyan('→'),
  bullet: chalk.dim('•'),
  dot:    chalk.dim('·'),
};

// ── Spinner ───────────────────────────────────────────────────────────────────

export function spin(text: string): Ora {
  return ora({ text, color: 'cyan' }).start();
}

// ── Table ─────────────────────────────────────────────────────────────────────

export function table(rows: Array<Record<string, string>>, columns: string[]): void {
  if (rows.length === 0) {
    console.log(c.dim('  (none)'));
    return;
  }

  // Compute column widths
  const widths = columns.map((col) =>
    Math.max(col.length, ...rows.map((r) => (r[col] ?? '').length)),
  );

  // Header
  const header = columns.map((col, i) => c.label(col.toUpperCase().padEnd(widths[i]))).join('  ');
  const divider = widths.map((w) => chalk.dim('─'.repeat(w))).join('  ');
  console.log('  ' + header);
  console.log('  ' + divider);

  // Rows
  for (const row of rows) {
    const line = columns.map((col, i) => (row[col] ?? '').padEnd(widths[i])).join('  ');
    console.log('  ' + line);
  }
}

// ── Section header ────────────────────────────────────────────────────────────

export function section(title: string): void {
  console.log('\n' + c.bold(title));
}

// ── Key-value detail view ─────────────────────────────────────────────────────

export function detail(pairs: Array<[string, string | undefined]>): void {
  const labelWidth = Math.max(...pairs.map(([k]) => k.length));
  for (const [key, val] of pairs) {
    if (val === undefined || val === '') continue;
    console.log(`  ${c.dim(key.padEnd(labelWidth))}  ${val}`);
  }
}

// ── Timestamp formatter ───────────────────────────────────────────────────────

export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)      return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000)   return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000)  return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

// ── Print errors ──────────────────────────────────────────────────────────────

export function printError(err: unknown): void {
  if (err instanceof Error) {
    console.error(c.error(`\nError: ${err.message}`));
  } else {
    console.error(c.error(`\nUnknown error: ${String(err)}`));
  }
}

// ── JSON output helper ────────────────────────────────────────────────────────

export function jsonOut(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

// ── Status badge ──────────────────────────────────────────────────────────────

export function statusBadge(status: string): string {
  switch (status) {
    case 'completed': case 'connected': case 'active': case 'success':
      return chalk.green(status);
    case 'running': case 'working': case 'submitted':
      return chalk.cyan(status);
    case 'pending':
      return chalk.yellow(status);
    case 'failed': case 'error': case 'canceled':
      return chalk.red(status);
    case 'cancelled':
      return chalk.gray(status);
    case 'awaiting_approval':
      return chalk.magenta(status);
    default:
      return chalk.dim(status);
  }
}
