import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { safeStorage } from "electron";
import type { LocalState } from "@agent-commons/desktop-contract";

export const initialState = (): LocalState => ({
  version: 1,
  agents: [],
  conversations: [],
  spaces: [],
  tasks: [],
  workflows: [],
  apps: [],
  settings: {
    ollamaUrl: "http://127.0.0.1:11434",
    defaultModel: "",
    permissionMode: "ask",
  },
});

export class LocalStore {
  private state: LocalState;
  private readonly path: string;

  constructor(userDataDirectory: string) {
    this.path = join(userDataDirectory, "private-local", "state.bin");
    mkdirSync(dirname(this.path), { recursive: true });
    try {
      const bytes = readFileSync(this.path);
      const plaintext = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(bytes)
        : bytes.toString("utf8");
      const stored = JSON.parse(plaintext) as LocalState;
      this.state = stored.version === 1 ? stored : initialState();
    } catch {
      // Migrate early developer builds that stored state as permission-limited JSON.
      const legacy = join(dirname(this.path), "state.json");
      try {
        const stored = JSON.parse(readFileSync(legacy, "utf8")) as LocalState;
        this.state = stored.version === 1 ? stored : initialState();
        this.persist();
        if (existsSync(legacy)) unlinkSync(legacy);
      } catch {
        this.state = initialState();
      }
    }
  }

  get(): LocalState {
    return structuredClone(this.state);
  }

  update(mutator: (state: LocalState) => void): LocalState {
    mutator(this.state);
    this.persist();
    return this.get();
  }

  private persist() {
    const temporary = `${this.path}.tmp`;
    const plaintext = `${JSON.stringify(this.state)}\n`;
    const bytes = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(plaintext)
      : Buffer.from(plaintext, "utf8");
    writeFileSync(temporary, bytes, { mode: 0o600 });
    renameSync(temporary, this.path);
  }
}
