import { isAbsolute, relative, sep } from 'node:path';

export type ToolMode = 'ask' | 'read-only' | 'off';
export interface SessionOptions { agentId?: string; sessionId?: string; promptFile?: string; mode: ToolMode }
export function sessionArgs(options: SessionOptions): string[] {
  const args = ['code'];
  if (options.agentId) args.push('--agent', options.agentId);
  if (options.sessionId) args.push('--resume', options.sessionId);
  if (options.promptFile) args.push('--prompt-file', options.promptFile);
  if (options.mode === 'off') args.push('--no-local');
  if (options.mode === 'read-only') args.push('--read-only');
  return args;
}
export function insideRoot(root: string, file: string): boolean {
  const path = relative(root, file);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
export function validMode(value: unknown): ToolMode {
  return value === 'off' || value === 'read-only' ? value : 'ask';
}
export function nodeEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // A project must not inject preload scripts into the bundled runtime.
  const safe = { ...env };
  delete safe.NODE_OPTIONS;
  delete safe.NODE_PATH;
  delete safe.ELECTRON_RUN_AS_NODE;
  return safe;
}
