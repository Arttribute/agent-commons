import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { nodeEnvironment } from './launch';
/** IPC keeps credentials, source code and prompts out of shell arguments. */
export class Runtime {
  private child?: ChildProcess;
  private pending = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private executable: () => string,
    private path: string,
    private event: (event: any) => void
  ) {}
  private start(): ChildProcess {
    if (this.child) return this.child;
    const child = spawn(this.executable(), [this.path], {
      env: nodeEnvironment(process.env),
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      windowsHide: true,
    });
    this.child = child;
    child.stderr?.on('data', () => {});
    child.on('message', (message: any) => {
      if (message.event) {
        this.event(message.event);
        return;
      }
      const entry = this.pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error));
      else entry.resolve(message.result);
    });
    const fail = (error: Error) => {
      if (this.child !== child) return;
      this.child = undefined;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(error);
      }
      this.pending.clear();
    };
    child.on('error', () =>
      fail(
        new Error('Could not start Commons. Install Node.js 22+ or set Agent Commons: Node Path.')
      )
    );
    child.on('exit', () =>
      fail(new Error('Commons runtime stopped. Your conversation is preserved.'))
    );
    return child;
  }
  request(method: string, params: any = {}): Promise<any> {
    const child = this.start(),
      id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = ['send', 'login'].includes(method)
        ? undefined
        : setTimeout(() => {
            this.pending.delete(id);
            reject(new Error('Commons took too long to respond. Check your connection and retry.'));
          }, 45_000);
      this.pending.set(id, { resolve, reject, timer });
      child.send({ id, method, params }, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }
  approve(id: string, allow: boolean): void {
    this.child?.send({ method: 'approve', params: { id, allow } });
  }
  dispose(): void {
    const child = this.child;
    this.child = undefined;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Stopped.'));
    }
    this.pending.clear();
    child?.kill('SIGTERM');
  }
}
