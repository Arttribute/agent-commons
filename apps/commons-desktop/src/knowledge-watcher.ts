import { watch, type FSWatcher } from "node:fs";
import { relative, sep } from "node:path";
import { allowed, isIgnoredPath } from "./knowledge.ts";

type WatchedSpace = { id: string; folders: string[] };

/**
 * Keeps linked Knowledge folders in step with edits made outside Commons, for
 * example in an editor or by `git checkout`. Changes are debounced per space
 * and reported once; the caller reindexes incrementally. When recursive
 * watching is unavailable the watcher falls back to a slow poll.
 */
export class KnowledgeWatcher {
  private readonly watchers = new Map<string, FSWatcher[]>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly polls = new Map<string, NodeJS.Timeout>();
  private readonly onChange: (spaceId: string, reason: "files" | "git") => void;
  private readonly debounceMs: number;
  private readonly pollMs: number;

  constructor(onChange: (spaceId: string, reason: "files" | "git") => void, debounceMs = 1_200, pollMs = 30_000) {
    this.onChange = onChange;
    this.debounceMs = debounceMs;
    this.pollMs = pollMs;
  }

  sync(spaces: WatchedSpace[]) {
    const wanted = new Map(spaces.map((space) => [space.id, space]));
    for (const id of [...this.watchers.keys(), ...this.polls.keys()]) {
      if (!wanted.has(id)) this.unwatch(id);
    }
    for (const space of spaces) {
      if (this.watchers.has(space.id) || this.polls.has(space.id)) continue;
      this.watch(space);
    }
  }

  close() {
    for (const id of [...this.watchers.keys(), ...this.polls.keys()]) this.unwatch(id);
  }

  private watch(space: WatchedSpace) {
    const handles: FSWatcher[] = [];
    try {
      for (const folder of space.folders) {
        const handle = watch(folder, { recursive: true, persistent: false }, (_event, filename) => {
          if (!filename) return this.schedule(space.id, "files");
          const name = String(filename);
          const path = name.split(/[\\/]/);
          if (path[0] === ".git") {
            if (name === `.git${sep}HEAD` || name === ".git/HEAD") this.schedule(space.id, "git");
            return;
          }
          if (isIgnoredPath(name)) return;
          const last = path.at(-1) ?? "";
          // Directory events have no extension; they may add or remove files.
          if (!last.includes(".") || allowed(last)) this.schedule(space.id, "files");
        });
        handle.on("error", () => this.fallBackToPolling(space));
        handles.push(handle);
      }
      this.watchers.set(space.id, handles);
    } catch {
      for (const handle of handles) handle.close();
      this.fallBackToPolling(space);
    }
  }

  private fallBackToPolling(space: WatchedSpace) {
    for (const handle of this.watchers.get(space.id) ?? []) handle.close();
    this.watchers.delete(space.id);
    if (this.polls.has(space.id)) return;
    const poll = setInterval(() => this.onChange(space.id, "files"), this.pollMs);
    poll.unref();
    this.polls.set(space.id, poll);
  }

  private schedule(spaceId: string, reason: "files" | "git") {
    const pending = this.timers.get(spaceId);
    if (pending) clearTimeout(pending);
    const timer = setTimeout(() => {
      this.timers.delete(spaceId);
      this.onChange(spaceId, reason);
    }, this.debounceMs);
    timer.unref();
    this.timers.set(spaceId, timer);
  }

  private unwatch(id: string) {
    for (const handle of this.watchers.get(id) ?? []) handle.close();
    this.watchers.delete(id);
    const poll = this.polls.get(id);
    if (poll) clearInterval(poll);
    this.polls.delete(id);
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }
}

export function isInside(folder: string, path: string) {
  const offset = relative(folder, path);
  return offset === "" || (!offset.startsWith("..") && !offset.startsWith(sep));
}
