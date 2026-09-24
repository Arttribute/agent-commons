import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { safeStorage } from "electron";
import type { LocalState } from "@agent-commons/desktop-contract";

export const DEFAULT_LOCAL_MODEL = "qwen2.5-coder:0.5b";

function starterAgent() {
  const timestamp = new Date().toISOString();
  return {
    id: "commons-local",
    source: "local" as const,
    name: "Commons Copilot",
    avatar: "/commons-copilot.png",
    isDefault: true,
    copilotAccessMode: "confirm" as const,
    instructions:
      "You are a calm, capable Agent Commons co-creator. Help the user build, edit, research, and operate projects on this computer. Use local tools when useful, ask before consequential actions, and verify your work.",
    model: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export const initialState = (): LocalState => ({
  version: 1,
  agents: [starterAgent()],
  conversations: [],
  library: [],
  spaces: [],
  skills: [],
  tasks: [],
  workflows: [],
  apps: [],
  settings: {
    ollamaUrl: "http://127.0.0.1:11434",
    defaultModel: DEFAULT_LOCAL_MODEL,
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
      this.normalize();
    } catch {
      // Migrate early developer builds that stored state as permission-limited JSON.
      const legacy = join(dirname(this.path), "state.json");
      try {
        const stored = JSON.parse(readFileSync(legacy, "utf8")) as LocalState;
        this.state = stored.version === 1 ? stored : initialState();
        this.normalize();
        this.persist();
        if (existsSync(legacy)) unlinkSync(legacy);
      } catch {
        this.state = initialState();
      }
    }
    if (this.state.agents.length === 0) {
      this.state.agents.push(initialState().agents[0]);
      this.persist();
    }
    if (!Array.isArray(this.state.skills)) {
      this.state.skills = [];
      this.persist();
    }
    if (!Array.isArray(this.state.library)) this.state.library = [];
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

  private normalize() {
    this.state.settings.defaultModel ||= DEFAULT_LOCAL_MODEL;
    if (!this.state.agents.length) this.state.agents.push(starterAgent());
  }
}
