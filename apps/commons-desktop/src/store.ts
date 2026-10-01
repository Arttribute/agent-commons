import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statfsSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { totalmem } from "node:os";
import { safeStorage } from "electron";
import type { LocalState } from "@agent-commons/desktop-contract";

export const DEFAULT_LOCAL_MODEL = totalmem() >= 8 * 1024 ** 3 ? "qwen3.5:2b" : "qwen3:1.7b";

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
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") chmodSync(dirname(this.path), 0o700);
    if (existsSync(this.path)) {
      try {
        this.state = this.readState(this.path);
      } catch (error) {
        const backup = `${this.path}.bak`;
        if (!existsSync(backup)) throw error;
        this.state = this.readState(backup);
        this.persist(false);
      }
      this.normalize();
    } else {
      // Migrate early developer builds that stored state as permission-limited JSON.
      const legacy = join(dirname(this.path), "state.json");
      if (existsSync(legacy)) {
        let stored: LocalState;
        try { stored = JSON.parse(readFileSync(legacy, "utf8")) as LocalState; }
        catch { throw new Error("The legacy Local workspace could not be read. Its files were left untouched."); }
        if (stored.version !== 1) throw new Error(`Unsupported Local workspace version: ${stored.version}. Its files were left untouched.`);
        this.state = stored;
        this.normalize();
        this.persist();
        unlinkSync(legacy);
      } else {
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
    this.ensureEmergencyReserve();
  }

  private readState(path: string): LocalState {
      const bytes = readFileSync(path);
      let plaintext: string;
      // Plain JSON has always been a supported fallback. Recognize it first
      // so macOS does not consult Keychain just to open a permission-limited
      // Local file. Packaged, ad-hoc signed apps can otherwise block forever
      // in SecItemCopyMatching on a machine without an unlocked Keychain.
      if (bytes.subarray(0, 1).toString("utf8") === "{") {
        plaintext = bytes.toString("utf8");
      } else {
        try {
          plaintext = safeStorage.isEncryptionAvailable()
            ? safeStorage.decryptString(bytes)
            : bytes.toString("utf8");
        } catch {
          throw new Error("The Local workspace state could not be unlocked. Its files were left untouched; restore access to this computer's secure storage and reopen Desktop.");
        }
      }
      let stored: LocalState;
      try { stored = JSON.parse(plaintext) as LocalState; }
      catch { throw new Error("The Local workspace state could not be unlocked. Its files were left untouched; restore access to this computer's secure storage and reopen Desktop."); }
      if (stored.version !== 1) throw new Error(`Unsupported Local workspace version: ${stored.version}. Its files were left untouched.`);
      if (!Array.isArray(stored.conversations) || !Array.isArray(stored.agents) || !stored.settings) {
        throw new Error("The Local workspace state is incomplete. Its files were left untouched.");
      }
      return stored;
  }

  get(): LocalState {
    return structuredClone(this.state);
  }

  update(mutator: (state: LocalState) => void): LocalState {
    const next = structuredClone(this.state);
    mutator(next);
    this.persist(true, next);
    this.state = next;
    return this.get();
  }

  private persist(backup = true, state = this.state) {
    const temporary = `${this.path}.tmp`;
    const emergencyReserve = `${this.path}.reserve`;
    const plaintext = `${JSON.stringify(state)}\n`;
    // The readable Local workspace already contains user data protected by
    // owner-only permissions. On macOS, safeStorage may synchronously wait for
    // Keychain authorization in packaged apps and freeze every IPC handler.
    const bytes = process.platform !== "darwin" && safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(plaintext)
      : Buffer.from(plaintext, "utf8");
    try {
      try {
        writeFileSync(temporary, bytes, { mode: 0o600 });
      } catch (error) {
        if (!this.isDiskFull(error)) throw error;
        if (existsSync(emergencyReserve)) unlinkSync(emergencyReserve);
        writeFileSync(temporary, bytes, { mode: 0o600 });
      }
      if (backup && existsSync(this.path)) {
        const backupTemporary = `${this.path}.bak.tmp`;
        try {
          copyFileSync(this.path, backupTemporary);
          renameSync(backupTemporary, `${this.path}.bak`);
        } catch (error) {
          if (existsSync(backupTemporary)) unlinkSync(backupTemporary);
          if (!this.isDiskFull(error)) throw error;
          // Keep the previous backup and save the current state while there
          // is still room for this small atomic rename.
        }
      }
      renameSync(temporary, this.path);
      this.ensureEmergencyReserve();
    } catch (error) {
      if (existsSync(temporary)) unlinkSync(temporary);
      if (this.isDiskFull(error)) throw new Error("This computer is out of disk space. Free space and continue; the last saved Local workspace is intact.");
      throw error;
    }
  }

  private isDiskFull(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOSPC";
  }

  private ensureEmergencyReserve() {
    const reserve = `${this.path}.reserve`;
    if (existsSync(reserve)) return;
    try {
      const disk = statfsSync(dirname(this.path));
      if (disk.bavail * disk.bsize > 12_000_000) {
        writeFileSync(reserve, randomBytes(2_000_000), { flag: "wx", mode: 0o600 });
      }
    } catch (error) {
      // The reserve is optional. A partial write has no value as emergency
      // headroom, and must not make an otherwise successful state save fail.
      if ((error as NodeJS.ErrnoException)?.code !== "EEXIST" && existsSync(reserve)) {
        try { unlinkSync(reserve); } catch { /* next startup may clean it */ }
      }
    }
  }

  private normalize() {
    this.state.settings.defaultModel ||= DEFAULT_LOCAL_MODEL;
    if (!["female", "male", "kokoro-heart", "kokoro-bella", "kokoro-michael", "kokoro-george"].includes(this.state.settings.voiceModel ?? "")) {
      this.state.settings.voiceModel = "female";
    }
    if (!this.state.agents.length) this.state.agents.push(starterAgent());
  }
}
