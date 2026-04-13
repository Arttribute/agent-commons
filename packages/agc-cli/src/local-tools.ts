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
 * • Shell commands are spawned with a 30-second timeout and no shell
 *   expansion (execFile, not exec) to reduce injection risk.
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
import { execFile } from 'child_process';
import * as readline from 'readline';

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

export function buildLocalToolsManifest(rootDir: string): string {
  return `
## CLI Local File System — ACTIVE

You are running inside a CLI session. The following tools are available in your tool list RIGHT NOW and execute directly on the user's machine. They are named with a \`cli_\` prefix.

**Session root:** ${rootDir}

### MANDATORY RULES — READ CAREFULLY

1. **Call cli_* tools immediately and directly.** Do NOT create tasks (createTask) for local file operations. Do NOT delegate to sub-agents. Do NOT ask the user to run commands themselves.
2. **Always show the actual output** returned by the tool in your response. Never say "I listed the files" without showing them. Report exactly what the tool returns.
3. **Never fabricate results.** Wait for the real tool output before responding.
4. **Sensitive paths are blocked** (.ssh, .gnupg, .aws, .env, credentials). Attempting to access them will return an error.
5. **cli_write_file and cli_run_command require the user to confirm** before executing — you will see the result after they approve.

### Available CLI tools

| Tool | What it does |
|------|-------------|
| \`cli_list_directory\` | List files and folders at a path (default: session root) |
| \`cli_read_file\` | Read the full contents of a file |
| \`cli_write_file\` | Write or overwrite a file (user confirmation required) |
| \`cli_search_files\` | Find files matching a pattern, e.g. "*.ts" |
| \`cli_run_command\` | Run a shell command and return output (user confirmation required) |

### Example — listing a directory

When the user asks "what's on my desktop?", call \`cli_list_directory\` with \`{"path": "Desktop"}\` immediately. Then show the result.

### Example — reading a file

Call \`cli_read_file\` with \`{"path": "Desktop/notes.txt"}\`. Then quote the content in your reply.

### Example — writing a file

Call \`cli_write_file\` with \`{"path": "output.txt", "content": "Hello"}\`. The user will be prompted to confirm.

### Example — running a command

Call \`cli_run_command\` with \`{"command": "ls", "args": ["-la"]}\`. The user will be prompted to confirm.
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

async function toolReadFile(args: Record<string, any>, cfg: LocalToolsConfig): Promise<string> {
  const { path: userPath } = args;
  if (!userPath) throw new Error('read_file requires a "path" argument');
  const abs = safePath(cfg.rootDir, userPath);
  assertNotSensitive(abs);
  if (!existsSync(abs)) throw new Error(`File not found: ${userPath}`);
  const stat = statSync(abs);
  if (stat.isDirectory()) throw new Error(`"${userPath}" is a directory, not a file`);
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
  const { command, args: cmdArgs = [], cwd } = args;
  if (!command || typeof command !== 'string') throw new Error('run_command requires a "command" string');
  if (!Array.isArray(cmdArgs)) throw new Error('"args" must be an array of strings');

  const workDir = cwd ? safePath(cfg.rootDir, cwd) : cfg.rootDir;
  const preview = [command, ...cmdArgs].join(' ');

  const ok = await confirm(
    `Agent wants to run: \x1b[1m${preview}\x1b[0m\n  \x1b[2min: ${workDir}\x1b[0m`,
    cfg,
    'run_command',
  );
  if (!ok) return 'User denied command execution.';

  return new Promise((resolve) => {
    execFile(command, cmdArgs.map(String), { cwd: workDir, timeout: 30_000, maxBuffer: 1_024 * 1_024 }, (err, stdout, stderr) => {
      const out = [stdout, stderr].filter(Boolean).join('\n--- stderr ---\n');
      if (err && !out) return resolve(`Error: ${err.message}`);
      resolve(out || '(no output)');
    });
  });
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
      case 'read_file':      result = await toolReadFile(args, cfg);      break;
      case 'write_file':     result = await toolWriteFile(args, cfg);     break;
      case 'list_directory': result = await toolListDirectory(args, cfg); break;
      case 'search_files':   result = await toolSearchFiles(args, cfg);   break;
      case 'run_command':    result = await toolRunCommand(args, cfg);     break;
      default:
        result = `Unknown tool: "${tool}". Available: read_file, write_file, list_directory, search_files, run_command`;
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
