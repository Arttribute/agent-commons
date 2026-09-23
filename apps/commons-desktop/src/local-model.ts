import { createHash } from "node:crypto";
import { accessSync, constants, createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { basename, delimiter, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import type { LocalModelStatus } from "@agent-commons/desktop-contract";

const execFileAsync = promisify(execFile);
const OLLAMA_VERSION = "0.34.3";
const OLLAMA_ORIGIN = "http://127.0.0.1:11434";

type RuntimeAsset = {
  name: string;
  sha256: string;
  size: number;
};

const RUNTIME_ASSETS: Partial<Record<NodeJS.Platform, Partial<Record<string, RuntimeAsset>>>> = {
  darwin: {
    arm64: { name: "ollama-darwin.tgz", sha256: "2c45865f94bce0d4d1d2567603dd2fdacaf375585220a175aa4800105193d36e", size: 158_600_511 },
    x64: { name: "ollama-darwin.tgz", sha256: "2c45865f94bce0d4d1d2567603dd2fdacaf375585220a175aa4800105193d36e", size: 158_600_511 },
  },
  win32: {
    arm64: { name: "ollama-windows-arm64.zip", sha256: "8e4433f7cd9d183ddeaaac120d4162ddb8287aba31c4ecd0b690d40d50d81269", size: 208_117_571 },
    x64: { name: "ollama-windows-amd64.zip", sha256: "306ce9e81e3491d147f558e60d7a389499f244d10f71859c6e4e899241d1b4ae", size: 1_460_962_639 },
  },
  linux: {
    arm64: { name: "ollama-linux-arm64.tar.zst", sha256: "cb1d3c178d48b302dbe42b4fb0ce25ef6282e02eac25496cfc07f5333e2264dd", size: 1_550_067_813 },
    x64: { name: "ollama-linux-amd64.tar.zst", sha256: "e83a089fd0cd2f79ee2933cca2085846a2065f497adbc6467c402177c68423f9", size: 1_427_391_999 },
  },
};

function executableName() {
  return process.platform === "win32" ? "ollama.exe" : "ollama";
}

function canExecute(path: string) {
  try {
    accessSync(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findFile(root: string, name: string, depth = 4): string | undefined {
  if (!existsSync(root) || depth < 0) return undefined;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return path;
    if (entry.isDirectory()) {
      const nested = findFile(path, name, depth - 1);
      if (nested) return nested;
    }
  }
  return undefined;
}

function systemCandidates() {
  const fromPath = (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, executableName()));
  const values = [
    process.env.COMMONS_DESKTOP_OLLAMA_PATH,
    "/opt/homebrew/bin/ollama",
    "/usr/local/bin/ollama",
    "/usr/bin/ollama",
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe") : undefined,
    ...fromPath,
  ];
  return values.filter((value): value is string => Boolean(value));
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class LocalModelManager {
  private status: LocalModelStatus = { state: "checking", label: "Checking local AI" };
  private preparation?: Promise<void>;
  private server?: ChildProcess;

  constructor(
    private readonly directory: string,
    private readonly model: string,
    private readonly onStatus: (status: LocalModelStatus) => void,
  ) {}

  currentStatus() {
    return { ...this.status };
  }

  prepare() {
    this.preparation ??= this.prepareOnce().catch((error) => {
      const rawMessage = error instanceof Error ? error.message : "Local AI could not be prepared";
      const storageMessage = process.platform === "win32" || process.platform === "linux"
        ? "Agent Commons needs up to 4 GB of free space to prepare local AI on this computer."
        : "Agent Commons needs about 1 GB of free space to prepare local AI on this computer.";
      const label = /no space left|not enough space|disk full/i.test(rawMessage) ? storageMessage : rawMessage;
      this.update({
        state: "error",
        label,
      });
      this.preparation = undefined;
      throw new Error(label, { cause: error });
    });
    return this.preparation;
  }

  stop() {
    if (this.server && !this.server.killed) this.server.kill();
    this.server = undefined;
  }

  private update(status: LocalModelStatus) {
    this.status = status;
    this.onStatus({ ...status });
  }

  private async prepareOnce() {
    this.update({ state: "checking", label: "Checking local AI" });
    if (!(await this.serverReady())) {
      const executable = this.findInstalledRuntime() ?? (await this.installRuntime());
      await this.startServer(executable);
    }

    const models = await this.listModels();
    if (!models.some((candidate) => candidate === this.model || candidate === `${this.model}:latest`)) {
      await this.pullModel();
    }
    this.update({ state: "ready", label: "Local AI ready", progress: 1 });
  }

  private async serverReady() {
    try {
      const response = await fetch(`${OLLAMA_ORIGIN}/api/tags`, { signal: AbortSignal.timeout(1_500) });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async listModels() {
    const response = await fetch(`${OLLAMA_ORIGIN}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Local AI returned ${response.status}`);
    const payload = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    return (payload.models ?? []).map((item) => item.name ?? item.model ?? "").filter(Boolean);
  }

  private findInstalledRuntime() {
    const managed = findFile(join(this.directory, "runtime", OLLAMA_VERSION), executableName());
    if (managed && canExecute(managed)) return managed;
    return systemCandidates().find(canExecute);
  }

  private async installRuntime() {
    const asset = RUNTIME_ASSETS[process.platform]?.[process.arch];
    if (!asset) throw new Error(`Automatic local AI setup is not available for ${process.platform}/${process.arch}`);
    const downloads = join(this.directory, "downloads");
    const runtimeDirectory = join(this.directory, "runtime", OLLAMA_VERSION);
    mkdirSync(downloads, { recursive: true });
    mkdirSync(runtimeDirectory, { recursive: true });
    const archive = join(downloads, asset.name);
    if (!existsSync(archive) || !(await this.matchesHash(archive, asset.sha256))) {
      await this.downloadAsset(asset, archive);
    }

    this.update({ state: "starting", label: "Installing local AI runtime" });
    if (process.platform === "linux") {
      await execFileAsync("tar", ["--zstd", "-xf", archive, "-C", runtimeDirectory], { timeout: 15 * 60_000 });
    } else {
      await execFileAsync("tar", ["-xf", archive, "-C", runtimeDirectory], { timeout: 15 * 60_000 });
    }
    const executable = findFile(runtimeDirectory, executableName());
    if (!executable) throw new Error("The verified local AI runtime did not contain an Ollama executable");
    if (process.platform !== "win32") await execFileAsync("chmod", ["755", executable]);
    try {
      unlinkSync(archive);
    } catch {
      // The runtime is ready; antivirus scanners can briefly hold the archive
      // open on Windows, so cleanup must not make setup fail.
    }
    return executable;
  }

  private async matchesHash(path: string, expected: string) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return hash.digest("hex") === expected;
  }

  private async downloadAsset(asset: RuntimeAsset, destination: string) {
    this.update({ state: "downloading-runtime", label: "Downloading local AI runtime", progress: 0 });
    const response = await fetch(
      `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/${asset.name}`,
      { headers: { "User-Agent": "Agent-Commons-Desktop" }, signal: AbortSignal.timeout(30 * 60_000) },
    );
    if (!response.ok || !response.body) throw new Error(`Could not download local AI runtime (${response.status})`);
    const temporary = `${destination}.part`;
    const hash = createHash("sha256");
    let received = 0;
    let lastUpdate = 0;
    const meter = new Transform({
      transform: (chunk, _encoding, callback) => {
        const bytes = chunk as Buffer;
        received += bytes.length;
        hash.update(bytes);
        const timestamp = Date.now();
        if (timestamp - lastUpdate > 250) {
          lastUpdate = timestamp;
          this.update({
            state: "downloading-runtime",
            label: "Downloading local AI runtime",
            progress: Math.min(received / asset.size, 1),
          });
        }
        callback(null, bytes);
      },
    });
    await pipeline(Readable.fromWeb(response.body as never), meter, createWriteStream(temporary, { mode: 0o600 }));
    const actual = hash.digest("hex");
    if (actual !== asset.sha256) throw new Error(`Local AI runtime integrity check failed for ${basename(destination)}`);
    renameSync(temporary, destination);
  }

  private async startServer(executable: string) {
    this.update({ state: "starting", label: "Starting local AI" });
    const runtimeRoot = join(this.directory, "runtime", OLLAMA_VERSION);
    const pathParts = [join(runtimeRoot, "bin"), process.env.PATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":");
    const libraryParts = [join(runtimeRoot, "lib", "ollama"), process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
    this.server = spawn(executable, ["serve"], {
      env: {
        ...process.env,
        PATH: pathParts,
        LD_LIBRARY_PATH: libraryParts,
        OLLAMA_HOST: "127.0.0.1:11434",
        OLLAMA_MODELS: join(this.directory, "models"),
      },
      stdio: "ignore",
      windowsHide: true,
    });
    this.server.on("error", () => undefined);
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (await this.serverReady()) return;
      if (this.server.exitCode !== null) break;
      await delay(1_000);
    }
    throw new Error("Local AI did not start. Restart Agent Commons to try again.");
  }

  private async pullModel() {
    this.update({ state: "downloading-model", label: "Downloading the private local model", progress: 0 });
    const response = await fetch(`${OLLAMA_ORIGIN}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, stream: true }),
      signal: AbortSignal.timeout(60 * 60_000),
    });
    if (!response.ok || !response.body) throw new Error(`Could not download the local model (${response.status})`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string };
        if (event.error) {
          if (/no space left|not enough space|disk full/i.test(event.error)) {
            throw new Error("There is not enough free disk space to finish preparing local AI.");
          }
          throw new Error(event.error);
        }
        this.update({
          state: "downloading-model",
          label: event.status ? `Preparing local AI · ${event.status}` : "Preparing local AI",
          progress: event.total ? Math.min((event.completed ?? 0) / event.total, 1) : undefined,
        });
      }
      if (done) break;
    }
  }
}
