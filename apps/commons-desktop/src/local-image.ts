import { createHash, randomUUID } from "node:crypto";
import { totalmem } from "node:os";
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, statfsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { join, basename, extname } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { extractVerifiedRuntimeZip } from "./verified-runtime-zip";
import { recommendedImageModelId, supportsImageStarter } from "./local-image-model-choice";

const RELEASE = "master-929-3f8527a";
const RUNTIME_ASSETS: Record<string, { name: string; sha256: string }> = {
  "darwin-arm64": { name: "sd-master-3f8527a-bin-Darwin-macOS-26.6.2-arm64.zip", sha256: "1c8ee6c8e413e3335b1223bbc657ea5d86dae1819f8426a98b84c265587eb192" },
  "linux-x64": { name: "sd-master-3f8527a-bin-Linux-Ubuntu-24.04-x86_64.zip", sha256: "9ad35ed309dbe59f5e66f35edafac9a69e6cc233ea6b9577071feae829159d37" },
  "win32-x64": { name: "sd-master-3f8527a-bin-win-cpu-x64.zip", sha256: "5e7caca2080321b25a12c1fa4175cb7d953f2b182309f8f73bfc9c725231d26c" },
};
const DEFAULT_MODEL = {
  id: "tiny-sd.safetensors",
  name: "Tiny SD · local starter",
  source: "https://huggingface.co/turingevo/tiny-sd-safetensors/resolve/main/segmind_tiny-sd.safetensors",
  sha256: "92e00b860c409f8cfc521a94f779009c6ebd28bf07670bf50e747682ab7b3b72",
  bytes: 1_060_307_606,
  ramGiB: 12,
  description: "Higher image detail at 512 × 512 pixels",
};
const IMAGE_CATALOG = [
  DEFAULT_MODEL,
  {
    id: "tiny-sd-q4.gguf",
    name: "Tiny SD · compact Q4",
    source: "https://huggingface.co/turingevo/tiny-sd-gguf/resolve/c6e3414/segmind_tiny-sd-q4_K.gguf",
    sha256: "69fe70e0b72f3ea22830b12ddabeb55ee8fe55a28ccc0b763ace4cf39af346d6",
    bytes: 774_886_240,
    ramGiB: 8,
    description: "Smaller download and memory use; reduced image detail",
  },
  {
    id: "tiny-sd-q8.gguf",
    name: "Tiny SD · Q8",
    source: "https://huggingface.co/turingevo/tiny-sd-gguf/resolve/89829af/segmind_tiny-sd-q8_0.gguf",
    sha256: "f23cd08965d55fc0887da4146a4f0785850037420f73b7347b62eeb4be13a300",
    bytes: 853_972_416,
    ramGiB: 12,
    description: "Smaller download with more detail than Q4",
  },
] as const;

export type ImageModelStatus = { state: "idle" | "downloading" | "ready" | "error"; label: string; modelId?: string; progress?: number; error?: string };

async function downloadVerified(url: string, destination: string, sha256: string, onProgress: (progress: number) => void, maxBytes: number) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30 * 60_000) });
  if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status})`);
  const expectedLength = Number(response.headers.get("content-length") || 0);
  if (expectedLength > maxBytes) throw new Error("The model download is larger than expected.");
  let downloaded = 0;
  const hash = createHash("sha256");
  const stream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>);
  const verify = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    downloaded += chunk.length;
    if (downloaded > maxBytes) return callback(new Error("The model download is larger than expected."));
    hash.update(chunk);
    if (expectedLength) onProgress(Math.min(0.99, downloaded / expectedLength));
    callback(null, chunk);
  } });
  try {
    await pipeline(stream, verify, createWriteStream(destination, { flags: "wx", mode: 0o600 }));
    if (hash.digest("hex") !== sha256) throw new Error("Downloaded model or runtime failed its checksum. Retry the download.");
  } catch (error) {
    rmSync(destination, { force: true });
    throw error;
  }
}

/** Runs image generation entirely on the user's computer with verified model weights. */
export class LocalImageManager {
  private readonly starter = IMAGE_CATALOG.find((model) => model.id === recommendedImageModelId(totalmem()))!;
  private readonly root: string;
  private readonly models: string;
  private readonly runtime: string;
  private pending?: Promise<void>;
  private modelPending?: Promise<void>;
  private status: ImageModelStatus = { state: "idle", label: "Image model downloads when first used" };

  constructor(storageRoot: string, private readonly onStatus: (status: ImageModelStatus) => void, sharedStorageRoot = storageRoot) {
    this.root = join(storageRoot, "image-generation");
    this.models = join(sharedStorageRoot, "image-generation", "models");
    this.runtime = join(sharedStorageRoot, "image-generation", "runtime");
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    mkdirSync(this.models, { recursive: true, mode: 0o700 });
    const model = join(this.models, this.starter.id);
    if (existsSync(this.executable()) && existsSync(model) && statSync(model).size === this.starter.bytes) {
      this.status = { state: "ready", label: `${this.starter.name} ready`, modelId: this.starter.id };
    }
  }

  currentStatus() { return this.status; }
  catalog() { return IMAGE_CATALOG.map(({ id, name, bytes, ramGiB, description }) => ({ id, name, bytes, ramGiB, description, recommended: id === this.starter.id })); }
  listModels() {
    return readdirSync(this.models).filter((name) => [".safetensors", ".gguf", ".ckpt"].includes(extname(name).toLowerCase()))
      .map((name) => ({ id: name, name: IMAGE_CATALOG.find((model) => model.id === name)?.name ?? name, bytes: statSync(join(this.models, name)).size }));
  }
  modelDirectory() { return this.models; }
  private update(status: ImageModelStatus) { this.status = status; this.onStatus(status); }
  private executable() { return join(this.runtime, process.platform === "win32" ? "sd-cli.exe" : "sd-cli"); }

  async prepare(installDefault = true) {
    if (installDefault && !supportsImageStarter(totalmem())) {
      throw new Error("Automatic local image generation needs at least 8 GB RAM while the chat model is running.");
    }
    if (this.pending) await this.pending;
    const model = join(this.models, this.starter.id);
    if (existsSync(this.executable()) && (!installDefault || (existsSync(model) && statSync(model).size === this.starter.bytes))) {
      if (this.status.state !== "ready") this.update({ state: "ready", label: installDefault ? `${this.starter.name} ready` : "Local image runtime ready", modelId: installDefault ? this.starter.id : undefined });
      return;
    }
    this.pending = this.prepareOnce(installDefault).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async prepareOnce(installDefault: boolean) {
    const asset = RUNTIME_ASSETS[`${process.platform}-${process.arch}`];
    if (!asset) throw new Error("Local image generation currently supports macOS ARM, Linux x64, and Windows x64.");
    try {
      const model = join(this.models, this.starter.id);
      const needsModel = installDefault && (!existsSync(model) || statSync(model).size !== this.starter.bytes);
      const disk = statfsSync(this.root);
      const freeBytes = disk.bavail * disk.bsize;
      const neededBytes = needsModel ? this.starter.bytes + 700_000_000 : 600_000_000;
      if (freeBytes < neededBytes) {
        throw new Error(`Free more disk space before downloading the local image model. At least ${(neededBytes / 1_000_000_000).toFixed(1)} GB is needed for the model and temporary files.`);
      }
      this.update({ state: "downloading", label: "Preparing local image runtime" });
      if (!existsSync(this.executable())) {
        const zip = join(this.root, `${randomUUID()}.zip`);
        const temp = join(this.root, `runtime-${randomUUID()}`);
        try {
          await downloadVerified(`https://github.com/leejet/stable-diffusion.cpp/releases/download/${RELEASE}/${asset.name}`, zip, asset.sha256,
            (progress) => this.update({ state: "downloading", label: "Downloading local image runtime", progress: progress * 0.1 }), 500_000_000);
          await extractVerifiedRuntimeZip(zip, temp);
          if (!existsSync(join(temp, basename(this.executable())))) throw new Error("Image runtime archive is incomplete.");
          rmSync(this.runtime, { recursive: true, force: true });
          renameSync(temp, this.runtime);
          if (process.platform !== "win32") await fs.chmod(this.executable(), 0o700);
        } finally { rmSync(zip, { force: true }); rmSync(temp, { recursive: true, force: true }); }
      }
      if (needsModel) {
        rmSync(model, { force: true });
        const temp = join(this.models, `${randomUUID()}.download`);
        try {
          this.update({ state: "downloading", label: `Downloading ${this.starter.name}`, modelId: this.starter.id, progress: 0.1 });
          await downloadVerified(this.starter.source, temp, this.starter.sha256,
            (progress) => this.update({ state: "downloading", label: `Downloading ${this.starter.name}`, modelId: this.starter.id, progress: 0.1 + 0.9 * progress }), this.starter.bytes);
          renameSync(temp, model);
        } finally { rmSync(temp, { force: true }); }
      }
      this.update({ state: "ready", label: installDefault ? `${this.starter.name} ready` : "Local image runtime ready", modelId: installDefault ? this.starter.id : undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.update({ state: "error", label: "Image model unavailable", error: message });
      throw error;
    }
  }

  /** Download a reviewed checkpoint into the same model folder used by sd-cli. */
  async prepareModel(modelId = this.starter.id) {
    if (modelId === this.starter.id) return this.prepare(true);
    const selected = IMAGE_CATALOG.find((model) => model.id === modelId);
    if (!selected) return this.prepare(false); // User-added compatible checkpoint.
    if (this.modelPending) await this.modelPending;
    const destination = join(this.models, selected.id);
    await this.prepare(false);
    if (existsSync(destination) && statSync(destination).size === selected.bytes) return;
    const disk = statfsSync(this.root);
    if (disk.bavail * disk.bsize < selected.bytes + 500_000_000) {
      throw new Error(`Free at least ${Math.ceil((selected.bytes + 500_000_000) / 1_000_000_000)} GB before downloading ${selected.name}.`);
    }
    this.modelPending = (async () => {
      const temp = join(this.models, `${randomUUID()}.download`);
      try {
        this.update({ state: "downloading", label: `Downloading ${selected.name}`, modelId, progress: 0 });
        await downloadVerified(selected.source, temp, selected.sha256,
          (progress) => this.update({ state: "downloading", label: `Downloading ${selected.name}`, modelId, progress }), selected.bytes);
        if (existsSync(destination)) rmSync(destination, { force: true });
        renameSync(temp, destination);
        this.update({ state: "ready", label: `${selected.name} ready`, modelId });
      } catch (error) {
        this.update({ state: "error", label: `${selected.name} unavailable`, modelId, error: error instanceof Error ? error.message : String(error) });
        throw error;
      } finally { rmSync(temp, { force: true }); }
    })().finally(() => { this.modelPending = undefined; });
    return this.modelPending;
  }

  async generate(prompt: string, modelId = this.starter.id) {
    if (!prompt.trim() || prompt.length > 2_000) throw new Error("Image prompt must be 1 to 2,000 characters.");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}\.(?:safetensors|gguf|ckpt)$/i.test(modelId)) throw new Error("Choose an installed image model.");
    await this.prepareModel(modelId);
    const model = join(this.models, modelId);
    if (!existsSync(model)) throw new Error("Image model is not installed. Add it in General settings.");
    const output = join(this.root, `generated-${randomUUID()}.png`);
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(this.executable(), ["-m", model, "-W", "512", "-H", "512", "--cfg-scale", "7", "--steps", "20", "--sampling-method", "euler_a", "--diffusion-fa", "--seed", "-1", "-o", output, "-p", prompt], { cwd: this.root, shell: false, stdio: ["ignore", "ignore", "pipe"] });
        let errorOutput = "";
        child.stderr.on("data", (chunk: Buffer) => { errorOutput = (errorOutput + chunk.toString()).slice(-4_000); });
        const timer = setTimeout(() => { child.kill(); reject(new Error("Image generation timed out after 10 minutes.")); }, 10 * 60_000);
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.once("close", (code) => {
          clearTimeout(timer);
          code === 0 && existsSync(output) ? resolve() : reject(new Error(`Image generation failed (${code}). ${errorOutput.slice(-500)}`));
        });
      });
      return { path: output, modelId };
    } catch (error) { rmSync(output, { force: true }); throw error; }
  }
}
