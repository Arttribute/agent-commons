/**
 * local-tools.ts
 *
 * File-system and shell tools that run on the user's machine during an
 * agc chat --local session.  The agent is given a tool manifest at the
 * start of the session; when it wants to call a tool it emits a structured
 * JSON block that this module intercepts, validates, and executes locally —
 * returning the result as the next user message so the agent can continue.
 *
 * Security model
 * ──────────────
 * • All file paths are resolved against the session root (default: cwd).
 *   Any path that escapes the root is rejected.
 * • Destructive operations (write, delete, run_command) require explicit
 *   per-operation user confirmation unless the user pre-approved the type.
 * • Short commands use cli_run_command (120s default, max 300s).
 * • Long-running commands (builds, installs, scaffolders) use cli_start_process
 *   which spawns non-blocking and returns a processId. The agent polls via
 *   cli_wait_for_process (blocks ≤60s per call) so it can report progress.
 * • A full audit log is appended to ~/.agc/sessions/<sessionId>.jsonl.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'fs';
import { join, resolve, relative, extname, dirname } from 'path';
import { execFile, spawn } from 'child_process';
import * as readline from 'readline';
// pdf-parse: pure-JS PDF text extractor, no system dependencies required.
// Import from lib/pdf-parse.js to skip the test-file side-effect in the main entry.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> =
  require('pdf-parse/lib/pdf-parse.js');

// ── Background process manager ────────────────────────────────────────────────
//
// Long-running commands (npm installs, scaffolders, builds) are spawned via
// cli_start_process and tracked here. The agent polls with cli_wait_for_process
// or cli_process_status without needing the SSE connection to stay open for the
// full duration.

export type ProcessStatus = 'running' | 'done' | 'error' | 'killed';

interface ManagedProcess {
  id: string;
  command: string;       // full command string for display
  status: ProcessStatus;
  exitCode: number | null;
  stdout: string;        // rolling buffer (capped at 200 KB)
  stderr: string;        // rolling buffer (capped at 50 KB)
  startedAt: Date;
  endedAt: Date | null;
  child: ReturnType<typeof spawn>;
}

/** Module-level store — survives across tool calls within a session. */
const managedProcesses = new Map<string, ManagedProcess>();

/** Cap a string buffer to avoid unbounded memory growth. */
function capBuffer(existing: string, chunk: string, maxBytes: number): string {
  const joined = existing + chunk;
  if (joined.length <= maxBytes) return joined;
  return '…(truncated)\n' + joined.slice(-(maxBytes - 20));
}

// ── Directory snapshot ────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['.git', 'node_modules', '.cache', '__pycache__', '.next', 'dist', 'build', '.DS_Store']);

/**
 * Build a compact tree-style listing of a directory up to `maxDepth` levels.
 * Skips hidden directories and heavy build/dependency folders.
 * Capped at 300 entries to keep token count reasonable.
 */
export function buildDirSnapshot(dir: string, maxDepth = 2): string {
  const lines: string[] = [`${dir}/`];

  function walk(d: string, depth: number, prefix: string): void {
    if (lines.length >= 300) return;
    let entries: ReturnType<typeof readdirSync>;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }

    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (lines.length >= 300) { lines.push(`${prefix}... (truncated)`); return; }
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const isDir = entry.isDirectory();
      lines.push(`${prefix}${entry.name}${isDir ? '/' : ''}`);
      if (isDir && depth < maxDepth) walk(join(d, entry.name), depth + 1, prefix + '  ');
    }
  }

  walk(dir, 1, '  ');
  return lines.join('\n');
}

/**
 * Read a file and return its content, capped at 100 KB.
 * Returns an error string if the file can't be read.
 */
export function readFileForContext(rootDir: string, filePath: string): string {
  try {
    const abs = resolve(rootDir, filePath);
    const rel = relative(rootDir, abs);
    if (rel.startsWith('..') || rel.startsWith('/')) return `[error: path escapes session root]`;
    for (const pat of [/\/\.ssh\//, /\/\.aws\//, /\/\.env$/, /\/\.env\./, /id_rsa/, /id_ed25519/]) {
      if (pat.test(abs)) return `[error: sensitive path blocked]`;
    }
    if (!existsSync(abs)) return `[error: file not found: ${filePath}]`;
    const stat = statSync(abs);
    if (stat.isDirectory()) return `[error: "${filePath}" is a directory — use list_directory]`;
    if (stat.size > 100_000) return `[truncated — file too large (${Math.round(stat.size / 1024)} KB). Use cli_read_file for full content]`;
    return readFileSync(abs, 'utf8');
  } catch (err: any) {
    return `[error reading file: ${err?.message}]`;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalToolCall {
  tool: string;
  args: Record<string, any>;
}

export type PermissionLevel = 'ask' | 'allow' | 'deny';

export interface LocalToolsConfig {
  /** Absolute path the agent is allowed to read/write within. Default: cwd. */
  rootDir: string;
  /** Session ID used for audit log entries. */
  sessionId: string;
  /** Append an audit record (same format as chat.ts log). */
  appendLog: (record: Record<string, unknown>) => void;
  /** Per-tool-type permission cache so user isn't asked repeatedly. */
  permissions: Map<string, PermissionLevel>;
}

// ── Tool manifest injected as a system message at session start ───────────────
//
// Written to closely match how Claude Code/function-calling-trained LLMs
// expect tool invocation instructions in a system prompt.

export function buildLocalToolsManifest(rootDir: string, snapshot: string, fileContextBlocks: string[] = []): string {
  const fileSection = fileContextBlocks.length
    ? `\n### File contents included in this turn\n\n${fileContextBlocks.join('\n\n')}\n`
    : '';

  return `
## CLI Local File System — ACTIVE

You are running inside a CLI session with DIRECT access to the user's local machine. The following tools are in your tool list and execute on the user's machine in real time.

**Session root:** ${rootDir}

### Current file system (live snapshot)

\`\`\`
${snapshot}
\`\`\`
${fileSection}

### MANDATORY RULES — READ CAREFULLY

1. **Call cli_* tools immediately and directly.** Do NOT create tasks (createTask) for local file operations. Do NOT delegate to sub-agents. Do NOT ask the user to run commands themselves.
2. **Always show the actual output** returned by the tool in your response. Never say "I listed the files" without showing them. Report exactly what the tool returns.
3. **Never fabricate results.** Wait for the real tool output before responding.
4. **Sensitive paths are blocked** (.ssh, .gnupg, .aws, .env, credentials). Attempting to access them will return an error.
5. **cli_write_file and cli_run_command require the user to confirm** before executing — you will see the result after they approve.

### Available CLI tools

| Tool | What it does |
|------|-------------|
| \`cli_list_directory\` | List files and folders at a path |
| \`cli_read_file\` | Read a file (PDF and Word docs are extracted to text) |
| \`cli_write_file\` | Write or overwrite a file (user confirmation required) |
| \`cli_search_files\` | Find files matching a pattern |
| \`cli_run_command\` | Run a short command and return its output (user confirmation required) |
| \`cli_start_process\` | Start a long-running command in the background; returns a processId immediately |
| \`cli_wait_for_process\` | Block up to N seconds for a background process, then return current output |
| \`cli_process_status\` | Instant non-blocking check on a background process |
| \`cli_kill_process\` | Kill a running background process |
| \`cli_list_processes\` | List all background processes started this session |

### Choosing between run_command and start_process

| Situation | Use |
|-----------|-----|
| Command finishes in under ~30s | \`cli_run_command\` |
| Command may take minutes (npm install, build, scaffold) | \`cli_start_process\` + \`cli_wait_for_process\` |
| Command needs live stdin (e.g. a REPL) | \`cli_run_command\` with \`"interactive": true\` |

### run_command options
- \`timeout_seconds\` (default 120, max 300) — kill the process after N seconds
- \`interactive\` (boolean) — connects the user's terminal stdin for commands that need input

### start_process + wait_for_process pattern

For long commands like \`npx create-next-app@latest my-app --yes\`:

1. Call \`cli_start_process\` — returns \`{processId, status: "running"}\` immediately. Tell the user it has started.
2. Call \`cli_wait_for_process\` with \`{"processId": "...", "wait_seconds": 60}\` — blocks up to 60s then returns current stdout/status. Report progress to the user.
3. Repeat step 2 until \`status\` is \`"done"\` or \`"error"\`.
4. Report the final output to the user.

Never hold the user in silence. Between each \`cli_wait_for_process\` call, tell them what you saw so far.

### Example — scaffolding a Next.js project

\`\`\`
cli_start_process: {"command": "npx", "args": ["create-next-app@latest", "my-app", "--yes"], "cwd": "Desktop"}
→ {processId: "proc_1a2b", status: "running"}

Tell user: "Started! Installing dependencies, this takes a minute or two. Checking in 60s…"

cli_wait_for_process: {"processId": "proc_1a2b", "wait_seconds": 60}
→ {status: "running", elapsedSec: 60, stdout: "Creating project...\nInstalling packages…"}

Tell user: "Still installing — here's output so far: [stdout]. Checking again…"

cli_wait_for_process: {"processId": "proc_1a2b", "wait_seconds": 60}
→ {status: "done", exitCode: 0, elapsedSec: 93, stdout: "Success! Created my-app"}

Tell user: "Done! Project created in Desktop/my-app"
\`\`\`
`;
}

// ── Pattern that detects a tool call block in agent output ────────────────────

const TOOL_CALL_RE = /```tool\s*\n([\s\S]*?)\n```/;

export function extractToolCall(text: string): LocalToolCall | null {
  const match = text.match(TOOL_CALL_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (typeof parsed.tool === 'string') return parsed as LocalToolCall;
  } catch {
    // malformed JSON — ignore
  }
  return null;
}

// ── Security helpers ──────────────────────────────────────────────────────────

function safePath(root: string, userPath: string): string {
  const abs = resolve(root, userPath);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || rel.startsWith('/')) {
    throw new Error(`Path "${userPath}" escapes the session root. Access denied.`);
  }
  return abs;
}

// Directories that are always blocked even if they happen to be under rootDir
const BLOCKED_PATTERNS = [
  /\/\.ssh\//,
  /\/\.gnupg\//,
  /\/\.agc\//,
  /\/\.aws\//,
  /\/\.env$/,
  /\/\.env\./,
  /id_rsa/,
  /id_ed25519/,
];

function assertNotSensitive(abs: string): void {
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(abs)) {
      throw new Error(`Access to "${abs}" is blocked for security reasons.`);
    }
  }
}

// ── User confirmation ─────────────────────────────────────────────────────────

async function confirm(
  message: string,
  config: LocalToolsConfig,
  permissionKey: string,
): Promise<boolean> {
  const cached = config.permissions.get(permissionKey);
  if (cached === 'allow') return true;
  if (cached === 'deny') return false;

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(
      `\n  \x1b[33m⚠\x1b[0m  ${message}\n` +
      `  \x1b[2m[y] Yes  [n] No  [A] Always allow this type  [N] Never allow this type\x1b[0m\n` +
      `  \x1b[36m?\x1b[0m  `,
    );
    rl.once('line', (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === 'a') {
        config.permissions.set(permissionKey, 'allow');
        resolve(true);
      } else if (a === 'n' || a === 'nn') {
        config.permissions.set(permissionKey, 'deny');
        resolve(false);
      } else {
        resolve(a === 'y' || a === 'yes' || a === '');
      }
    });
  });
}

// ── Tool implementations ──────────────────────────────────────────────────────

// Extensions that need special text extraction (not plain utf-8)
const OFFICE_EXTS = new Set(['.docx', '.doc', '.rtf', '.odt', '.pages']);
const PDF_EXTS = new Set(['.pdf']);
const UNREADABLE_BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.tiff',
  '.mp3', '.mp4', '.wav', '.aac', '.ogg', '.flac',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.psd', '.ai', '.sketch', '.figma',
  '.xlsx', '.xls', '.pptx', '.ppt',
]);

/** Use macOS textutil (built-in) or pdftotext (brew) to extract text. */
function extractViaCommand(cmd: string, cmdArgs: string[]): Promise<string> {
  return new Promise((res) => {
    execFile(cmd, cmdArgs, { timeout: 30_000, maxBuffer: 2 * 1_024 * 1_024 }, (err, stdout) => {
      if (err) res('');
      else res(stdout.trim());
    });
  });
}

async function extractPdfText(abs: string): Promise<string> {
  // Primary: pdf-parse — pure Node.js, no system dependencies.
  try {
    const buffer = readFileSync(abs);
    const data = await pdfParse(buffer);
    const text = data.text?.trim();
    if (text) {
      // Cap at ~150 KB of text to keep token count reasonable
      const MAX_CHARS = 150_000;
      if (text.length > MAX_CHARS) {
        return text.slice(0, MAX_CHARS) + `\n\n[…truncated — showing first ${MAX_CHARS.toLocaleString()} characters of ${text.length.toLocaleString()} total]`;
      }
      return text;
    }
  } catch {
    // fall through to pdftotext
  }

  // Fallback: pdftotext (poppler, via `brew install poppler`)
  const text = await extractViaCommand('pdftotext', [abs, '-']);
  if (text) return text;

  return `[Cannot extract PDF text: the file may be scanned/image-only or password-protected]`;
}

async function extractOfficeText(abs: string, ext: string): Promise<string> {
  // macOS textutil is built-in and handles .docx, .doc, .rtf, .odt
  const text = await extractViaCommand('textutil', ['-stdout', '-cat', 'txt', abs]);
  if (text) return text;
  return `[Cannot extract ${ext} text: textutil failed or is unavailable on this system]`;
}

async function toolReadFile(args: Record<string, any>, cfg: LocalToolsConfig): Promise<string> {
  const { path: userPath } = args;
  if (!userPath) throw new Error('read_file requires a "path" argument');
  const abs = safePath(cfg.rootDir, userPath);
  assertNotSensitive(abs);
  if (!existsSync(abs)) throw new Error(`File not found: ${userPath}`);
  const stat = statSync(abs);
  if (stat.isDirectory()) throw new Error(`"${userPath}" is a directory, not a file`);

  const ext = extname(abs).toLowerCase();

  // PDFs and Office docs: extract text regardless of binary size (a large PDF
  // often compresses to a small amount of readable text).
  if (PDF_EXTS.has(ext)) {
    if (stat.size > 50_000_000) throw new Error(`PDF too large to read (${Math.round(stat.size / 1_000_000)} MB). Max 50 MB.`);
    return extractPdfText(abs);
  }
  if (OFFICE_EXTS.has(ext)) {
    if (stat.size > 20_000_000) throw new Error(`Document too large to read (${Math.round(stat.size / 1_000_000)} MB). Max 20 MB.`);
    return extractOfficeText(abs, ext);
  }

  if (UNREADABLE_BINARY_EXTS.has(ext)) {
    throw new Error(`Cannot read binary file "${userPath}" (${ext} format). Only text, PDF, and Office documents are supported.`);
  }

  // Plain text files: enforce 500 KB limit
  if (stat.size > 500_000) throw new Error(`File too large to read (${Math.round(stat.size / 1024)} KB). Max 500 KB.`);
  return readFileSync(abs, 'utf8');
}

async function toolWriteFile(args: Record<string, any>, cfg: LocalToolsConfig): Promise<string> {
  const { path: userPath, content } = args;
  if (!userPath) throw new Error('write_file requires a "path" argument');
  if (content === undefined) throw new Error('write_file requires a "content" argument');
  const abs = safePath(cfg.rootDir, userPath);
  assertNotSensitive(abs);
  const ok = await confirm(
    `Agent wants to write file: \x1b[1m${abs}\x1b[0m (${String(content).length} chars)`,
    cfg,
    'write_file',
  );
  if (!ok) return 'User denied write operation.';
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  return `Written ${String(content).length} bytes to ${userPath}`;
}

async function toolListDirectory(args: Record<string, any>, cfg: LocalToolsConfig): Promise<string> {
  const userPath = args.path ?? '.';
  const abs = safePath(cfg.rootDir, userPath);
  assertNotSensitive(abs);
  if (!existsSync(abs)) throw new Error(`Directory not found: ${userPath}`);
  const entries = readdirSync(abs, { withFileTypes: true });
  const lines = entries.map((e) => {
    const type = e.isDirectory() ? 'd' : e.isSymbolicLink() ? 'l' : 'f';
    return `[${type}] ${e.name}`;
  });
  return lines.join('\n') || '(empty directory)';
}

async function toolSearchFiles(args: Record<string, any>, cfg: LocalToolsConfig): Promise<string> {
  const { pattern, directory } = args;
  if (!pattern) throw new Error('search_files requires a "pattern" argument');
  const baseDir = safePath(cfg.rootDir, directory ?? '.');
  assertNotSensitive(baseDir);

  const results: string[] = [];
  const pat = new RegExp(
    pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'),
    'i',
  );

  function walk(dir: string, depth = 0): void {
    if (results.length >= 50 || depth > 10) return;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && depth > 0) continue;
        const full = join(dir, entry.name);
        const rel = relative(cfg.rootDir, full);
        if (pat.test(entry.name) || pat.test(rel)) results.push(rel);
        if (entry.isDirectory()) walk(full, depth + 1);
      }
    } catch { /* skip unreadable dirs */ }
  }

  walk(baseDir);
  return results.length ? results.join('\n') : 'No files found matching: ' + pattern;
}

async function toolRunCommand(args: Record<string, any>, cfg: LocalToolsConfig): Promise<string> {
  const { command, args: cmdArgs = [], cwd, timeout_seconds, interactive } = args;
  if (!command || typeof command !== 'string') throw new Error('run_command requires a "command" string');
  if (!Array.isArray(cmdArgs)) throw new Error('"args" must be an array of strings');

  const workDir = cwd ? safePath(cfg.rootDir, cwd) : cfg.rootDir;
  const preview = [command, ...cmdArgs].join(' ');
  // Default 120s, user-configurable up to 5 min
  const timeoutMs = Math.min(((typeof timeout_seconds === 'number' ? timeout_seconds : 120)) * 1_000, 300_000);

  const ok = await confirm(
    `Agent wants to run: \x1b[1m${preview}\x1b[0m\n  \x1b[2min: ${workDir}\x1b[0m`,
    cfg,
    'run_command',
  );
  if (!ok) return 'User denied command execution.';

  if (interactive) {
    // Connect the terminal's stdin/stdout so the user can answer prompts directly
    return new Promise((resolve) => {
      const child = spawn(command, cmdArgs.map(String), { cwd: workDir, stdio: 'inherit' });
      const timer = setTimeout(() => {
        child.kill();
        resolve(`(command timed out after ${timeoutMs / 1_000}s)`);
      }, timeoutMs);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(`(command exited with code ${code ?? 'unknown'})`);
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve(`Error: ${err.message}`);
      });
    });
  }

  return new Promise((resolve) => {
    execFile(command, cmdArgs.map(String), { cwd: workDir, timeout: timeoutMs, maxBuffer: 1_024 * 1_024 }, (err, stdout, stderr) => {
      const out = [stdout, stderr].filter(Boolean).join('\n--- stderr ---\n');
      if (err && !out) return resolve(`Error: ${err.message}`);
      resolve(out || '(no output)');
    });
  });
}

// ── Background process tools ──────────────────────────────────────────────────

async function toolStartProcess(args: Record<string, any>, cfg: LocalToolsConfig): Promise<string> {
  const { command, args: cmdArgs = [], cwd } = args;
  if (!command || typeof command !== 'string') throw new Error('start_process requires a "command" string');
  if (!Array.isArray(cmdArgs)) throw new Error('"args" must be an array of strings');

  const workDir = cwd ? safePath(cfg.rootDir, cwd) : cfg.rootDir;
  const preview = [command, ...cmdArgs].join(' ');

  const ok = await confirm(
    `Agent wants to start background process: \x1b[1m${preview}\x1b[0m\n  \x1b[2min: ${workDir}\x1b[0m`,
    cfg,
    'start_process',
  );
  if (!ok) return JSON.stringify({ error: 'User denied process start.' });

  const id = `proc_${Date.now().toString(36)}`;
  const child = spawn(command, cmdArgs.map(String), {
    cwd: workDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  const proc: ManagedProcess = {
    id,
    command: preview,
    status: 'running',
    exitCode: null,
    stdout: '',
    stderr: '',
    startedAt: new Date(),
    endedAt: null,
    child,
  };

  child.stdout?.on('data', (chunk: Buffer) => {
    proc.stdout = capBuffer(proc.stdout, chunk.toString(), 200_000);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    proc.stderr = capBuffer(proc.stderr, chunk.toString(), 50_000);
  });
  child.on('close', (code) => {
    proc.status = (code === 0) ? 'done' : 'error';
    proc.exitCode = code;
    proc.endedAt = new Date();
  });
  child.on('error', (err) => {
    proc.status = 'error';
    proc.endedAt = new Date();
    proc.stderr = capBuffer(proc.stderr, `\nSpawn error: ${err.message}`, 50_000);
  });

  managedProcesses.set(id, proc);
  cfg.appendLog({ type: 'process_start', processId: id, command: preview, timestamp: new Date().toISOString() });

  return JSON.stringify({ processId: id, status: 'running', command: preview });
}

function processSnapshot(proc: ManagedProcess): string {
  const elapsedSec = Math.round((Date.now() - proc.startedAt.getTime()) / 1_000);
  // Return last 4 KB of stdout so the agent can see recent output
  const recentStdout = proc.stdout.length > 4_000
    ? '…(earlier output truncated)\n' + proc.stdout.slice(-4_000)
    : proc.stdout;
  return JSON.stringify({
    processId: proc.id,
    command: proc.command,
    status: proc.status,
    exitCode: proc.exitCode,
    elapsedSec,
    stdout: recentStdout || '(no output yet)',
    stderr: proc.stderr.slice(-1_000) || undefined,
  });
}

async function toolProcessStatus(args: Record<string, any>, _cfg: LocalToolsConfig): Promise<string> {
  const { processId } = args;
  if (!processId) throw new Error('process_status requires a "processId" argument');
  const proc = managedProcesses.get(processId);
  if (!proc) return JSON.stringify({ error: `No process found with id "${processId}"` });
  return processSnapshot(proc);
}

async function toolWaitForProcess(args: Record<string, any>, _cfg: LocalToolsConfig): Promise<string> {
  const { processId, wait_seconds = 60 } = args;
  if (!processId) throw new Error('wait_for_process requires a "processId" argument');
  const proc = managedProcesses.get(processId);
  if (!proc) return JSON.stringify({ error: `No process found with id "${processId}"` });

  if (proc.status !== 'running') return processSnapshot(proc);

  // Block for up to wait_seconds (max 120s per call to stay within server timeout budget)
  const maxWait = Math.min((typeof wait_seconds === 'number' ? wait_seconds : 60) * 1_000, 120_000);
  const deadline = Date.now() + maxWait;

  await new Promise<void>((resolve) => {
    const tick = setInterval(() => {
      if (proc.status !== 'running' || Date.now() >= deadline) {
        clearInterval(tick);
        resolve();
      }
    }, 500);
  });

  return processSnapshot(proc);
}

async function toolKillProcess(args: Record<string, any>, cfg: LocalToolsConfig): Promise<string> {
  const { processId } = args;
  if (!processId) throw new Error('kill_process requires a "processId" argument');
  const proc = managedProcesses.get(processId);
  if (!proc) return JSON.stringify({ error: `No process found with id "${processId}"` });
  if (proc.status !== 'running') return JSON.stringify({ error: `Process "${processId}" is not running (status: ${proc.status})` });

  proc.child.kill('SIGTERM');
  proc.status = 'killed';
  proc.endedAt = new Date();
  cfg.appendLog({ type: 'process_killed', processId, timestamp: new Date().toISOString() });

  return JSON.stringify({ processId, status: 'killed' });
}

async function toolListProcesses(_args: Record<string, any>, _cfg: LocalToolsConfig): Promise<string> {
  if (managedProcesses.size === 0) return JSON.stringify([]);
  const list = [...managedProcesses.values()].map((p) => ({
    processId: p.id,
    command: p.command,
    status: p.status,
    elapsedSec: Math.round((Date.now() - p.startedAt.getTime()) / 1_000),
  }));
  return JSON.stringify(list);
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function runLocalTool(
  call: LocalToolCall,
  cfg: LocalToolsConfig,
): Promise<string> {
  const { tool, args } = call;

  cfg.appendLog({
    type: 'local_tool_call',
    tool,
    args,
    timestamp: new Date().toISOString(),
  });

  let result: string;
  try {
    switch (tool) {
      case 'read_file':       result = await toolReadFile(args, cfg);       break;
      case 'write_file':      result = await toolWriteFile(args, cfg);      break;
      case 'list_directory':  result = await toolListDirectory(args, cfg);  break;
      case 'search_files':    result = await toolSearchFiles(args, cfg);    break;
      case 'run_command':     result = await toolRunCommand(args, cfg);      break;
      case 'start_process':   result = await toolStartProcess(args, cfg);   break;
      case 'process_status':  result = await toolProcessStatus(args, cfg);  break;
      case 'wait_for_process':result = await toolWaitForProcess(args, cfg); break;
      case 'kill_process':    result = await toolKillProcess(args, cfg);    break;
      case 'list_processes':  result = await toolListProcesses(args, cfg);  break;
      default:
        result = `Unknown tool: "${tool}". Available: read_file, write_file, list_directory, search_files, run_command, start_process, wait_for_process, process_status, kill_process, list_processes`;
    }
  } catch (err: any) {
    result = `Error: ${err?.message ?? String(err)}`;
  }

  cfg.appendLog({
    type: 'local_tool_result',
    tool,
    result: result.slice(0, 2000), // cap log size
    timestamp: new Date().toISOString(),
  });

  return result;
}
