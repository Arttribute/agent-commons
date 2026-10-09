import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { PYTHON_DATA_PACKAGES, PYTHON_PACKAGE_SELECTION_CODE, PYTHON_FONT_PRELUDE } from "@agent-commons/agent-core";
import { readOutputPublicationState, saveOutputPublicationState } from "./output-publication-state.ts";

const exec = promisify(execFile);
const UV_VERSION = "0.12.23";
const PYTHON_VERSION = "3.12.11";
export const DATA_PACKAGES = PYTHON_DATA_PACKAGES;
const ASSETS: Record<string, [string, string]> = {
  "darwin-arm64": ["aarch64-apple-darwin.tar.gz", "50487ae565ccd96e499056b4674d438f4c53170202617b4c759defe0c6a1b544"],
  "darwin-x64": ["x86_64-apple-darwin.tar.gz", "960da44cb4b73685206ddd250b19e0a117fa41095710c1038f081f5cb613efb4"],
  "linux-x64": ["x86_64-unknown-linux-gnu.tar.gz", "9167d72b3319674b6303c4cbe071854bba13ebdf3d76b1a7cbdc175471fb66d6"],
  "linux-arm64": ["aarch64-unknown-linux-gnu.tar.gz", "6524bd338177ed50d035d39354e12545e993bbeba2ecbddf0480c5b3a81d313f"],
  "win32-x64": ["x86_64-pc-windows-msvc.zip", "75d05de6762778c31ee183398de7dd15093fad0ed90b1f236d8205ea5ec00c90"],
  "win32-arm64": ["aarch64-pc-windows-msvc.zip", "13294e232ececbe709c06b74e6ced06f2a225ea5591476685362f22be56a50d5"],
};

/** App-owned interpreter and dependencies. Never changes PATH, user site-packages or shell config. */
export class PythonRuntime {
  private preparation?: Promise<string>;
  private readonly extensions = new Map<string, Promise<string>>();
  constructor(private readonly root: string) {}

  prepare() {
    this.preparation ??= this.prepareOnce().catch((error) => { this.preparation = undefined; throw error; });
    return this.preparation;
  }

  private environment() {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(?:UV_|PYTHON|VIRTUAL_ENV|CONDA|PIP_)/.test(key)) delete env[key];
    return { ...env, UV_PYTHON_INSTALL_DIR: join(this.root, "interpreters"), UV_CACHE_DIR: join(this.root, "cache"), UV_PYTHON_PREFERENCE: "only-managed", UV_NO_CONFIG: "1", UV_PYTHON_BIN_DIR: join(this.root, "bin"), PYTHONNOUSERSITE: "1", MPLBACKEND: "Agg", MPLCONFIGDIR: join(this.root, "matplotlib"), PIP_DISABLE_PIP_VERSION_CHECK: "1" };
  }

  private async prepareOnce() {
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const executable = process.platform === "win32" ? "uv.exe" : "uv";
    const uv = join(this.root, `uv-${UV_VERSION}`, executable);
    if (!existsSync(uv)) {
      const asset = ASSETS[`${process.platform}-${process.arch}`];
      if (!asset) throw new Error(`Managed Python is unavailable on ${process.platform}/${process.arch}.`);
      const response = await fetch(`https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${asset[0]}`, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`Python runtime download failed (${response.status}).`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== asset[1]) throw new Error("Python runtime integrity check failed.");
      const temporary = join(this.root, `install-${randomUUID()}`);
      mkdirSync(temporary, { mode: 0o700 });
      try {
        const archive = join(temporary, asset[0]);
        writeFileSync(archive, bytes, { mode: 0o600 });
        await exec("tar", ["-xf", archive, "-C", temporary], { timeout: 30_000, windowsHide: true });
        const folder = readdirSync(temporary).find((name) => existsSync(join(temporary, name, executable)));
        const source = folder ? join(temporary, folder, executable) : join(temporary, executable);
        mkdirSync(join(this.root, `uv-${UV_VERSION}`), { recursive: true });
        renameSync(source, uv);
        if (process.platform !== "win32") chmodSync(uv, 0o700);
      } finally { rmSync(temporary, { recursive: true, force: true }); }
    }
    const venv = join(this.root, `data-${PYTHON_VERSION}-v1`);
    const python = join(venv, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    const marker = join(venv, "commons-ready.json");
    if (!existsSync(marker)) {
      const options = { env: this.environment(), timeout: 300_000, maxBuffer: 2_000_000, windowsHide: true };
      if (!existsSync(python)) await exec(uv, ["venv", "--python", PYTHON_VERSION, "--no-config", venv], options);
      await exec(uv, ["pip", "install", "--python", python, "--no-config", ...DATA_PACKAGES], options);
      await exec(python, ["-I", "-c", "import pandas, numpy, matplotlib, scipy, sklearn, seaborn, openpyxl, PIL"], options);
      writeFileSync(marker, JSON.stringify({ python: PYTHON_VERSION, packages: DATA_PACKAGES }), { mode: 0o600 });
    }
    return python;
  }

  private async withPackages(packages: string[]) {
    if (packages.length > 10 || packages.some((name) => !/^[a-zA-Z][a-zA-Z0-9_.-]*(?:\[[a-zA-Z0-9_,.-]+\])?(?:(?:==|>=|<=|~=)[a-zA-Z0-9_.+-]+)?$/.test(name))) throw new Error("Use up to ten Python package names, optionally with a version, without URLs or installer flags.");
    const base = await this.prepare();
    if (!packages.length) return base;
    const selection = await exec(base, ["-I", "-c", PYTHON_PACKAGE_SELECTION_CODE, JSON.stringify(packages)], { env: this.environment(), timeout: 30_000, maxBuffer: 32_000, windowsHide: true });
    packages = JSON.parse(selection.stdout) as string[];
    if (!packages.length) return base;
    const overridden = new Set(packages.map((name) => name.split(/[<>=~\[]/, 1)[0].toLowerCase().replace(/[-_.]+/g, "-")));
    const recipe = DATA_PACKAGES.filter((name) => !overridden.has(name.split("==")[0]));
    const key = createHash("sha256").update(JSON.stringify([...packages].sort())).digest("hex").slice(0, 16);
    if (!this.extensions.has(key)) this.extensions.set(key, (async () => {
      const venv = join(this.root, `extension-${key}`);
      const python = join(venv, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
      const uv = join(this.root, `uv-${UV_VERSION}`, process.platform === "win32" ? "uv.exe" : "uv");
      const options = { env: this.environment(), timeout: 300_000, maxBuffer: 2_000_000, windowsHide: true };
      if (!existsSync(join(venv, "commons-ready"))) {
        if (!existsSync(python)) await exec(uv, ["venv", "--python", PYTHON_VERSION, "--no-config", venv], options);
        await exec(uv, ["pip", "install", "--python", python, "--no-config", ...recipe, ...packages], options);
        writeFileSync(join(venv, "commons-ready"), "ready", { mode: 0o600 });
      }
      return python;
    })().catch((error) => { this.extensions.delete(key); throw error; }));
    return this.extensions.get(key)!;
  }

  async run(code: string, directory: string, inputs: Record<string, string>, workspace?: string, timeoutSeconds = 120, packages: string[] = [], signal?: AbortSignal, workingOutput?: string) {
    signal?.throwIfAborted();
    if (!code.trim() || code.length > 100_000) throw new Error("Provide Python code between 1 and 100,000 characters.");
    const python = await this.withPackages(packages);
    signal?.throwIfAborted();
    const output = workingOutput ?? join(directory, "outputs");
    const snapshotDirectory = join(directory, "snapshot");
    const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
    const scan = (folder: string) => {
      const paths = new Map<string, string>();
      let visited = 0; let bytes = 0;
      const collect = (current: string, depth = 0) => {
        if (depth > 16) throw new Error("Python output folders exceed the supported depth.");
        for (const name of readdirSync(current)) {
          if (++visited > 2_000) throw new Error("Python output exceeds the 2,000-entry limit.");
          const path = join(current, name); const info = lstatSync(path);
          if (info.isSymbolicLink()) continue;
          if (info.isDirectory()) collect(path, depth + 1);
          else if (info.isFile()) {
            bytes += info.size;
            if (bytes > 250 * 1024 * 1024) throw new Error("Python working files exceed 250 MB.");
            paths.set(path, hash(path));
          }
        }
      };
      collect(folder); return paths;
    };
    mkdirSync(output, { recursive: true, mode: 0o700 });
    if (lstatSync(output).isSymbolicLink()) throw new Error("Python output folder contains a symbolic link.");
    const baseline = readOutputPublicationState(output) ?? scan(output);
    saveOutputPublicationState(output, baseline);
    const stagedInputs: Record<string, string> = {};
    const copied = new Map<string, string>();
    const inputPaths = new Set<string>();
    const inputHashes = new Map<string, string>();
    const revisedInputs = new Map<string, string>();
    for (const [name, source] of Object.entries(inputs)) {
      let target = copied.get(source);
      if (!target) {
        target = resolve(output, name);
        if (inputPaths.has(target)) target = resolve(output, `input-${randomUUID()}`, name);
        const offset = relative(output, target);
        if (isAbsolute(offset) || offset === ".." || offset.startsWith(`..${sep}`)) throw new Error("Invalid input filename.");
        // Reject existing symlink parents before staging an input.
        for (let parent = target; parent !== output; parent = dirname(parent)) {
          try { if (lstatSync(parent).isSymbolicLink()) throw new Error("Python input path contains a symbolic link."); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        }
        // Keep earlier generated files in place; a reference attachment with the
        // same name gets its own copy instead of overwriting the working draft.
        if (existsSync(target) && hash(target) !== hash(source)) {
          const revisedName = join("revised-inputs", randomUUID(), name);
          target = join(directory, revisedName);
          revisedInputs.set(target, revisedName);
        }
        mkdirSync(dirname(target), { recursive: true });
        if (!existsSync(target)) {
          copyFileSync(source, target);
          if (!revisedInputs.has(target)) baseline.set(target, hash(target));
        }
        copied.set(source, target);
        inputPaths.add(target);
        inputHashes.set(target, createHash("sha256").update(readFileSync(target)).digest("hex"));
      }
      stagedInputs[name] = target;
    }
    saveOutputPublicationState(output, baseline);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const script = join(directory, `analysis-${randomUUID()}.py`);
    const prelude = `from pathlib import Path\nINPUT_FILES = ${JSON.stringify(stagedInputs)}\nOUTPUT_DIR = Path(${JSON.stringify(output)})\nWORKSPACE_ROOT = ${JSON.stringify(workspace ?? "")}\n`;
    writeFileSync(script, prelude + PYTHON_FONT_PRELUDE + code, { mode: 0o600 });
    try {
      const { stdout, stderr } = await exec(python, ["-I", script], { cwd: output, env: { ...this.environment(), OUTPUT_DIR: output, WORKSPACE_ROOT: workspace ?? "" }, signal, timeout: Math.max(1, Math.min(timeoutSeconds, 300)) * 1000, maxBuffer: 2_000_000, windowsHide: true });
      signal?.throwIfAborted();
      const current = scan(output);
      const changed = [...current].filter(([path, digest]) => baseline.get(path) !== digest);
      const changedInputs = [...revisedInputs].filter(([path]) => hash(path) !== inputHashes.get(path));
      for (const [path] of [...changed, ...changedInputs]) {
        if (path.toLowerCase().endsWith('.json')) {
          try { JSON.parse(readFileSync(path, 'utf8')); }
          catch { throw new Error(`Invalid JSON in ${relative(output, path)}. Encode missing values as null and use finite numbers; NaN and Infinity are not JSON.`); }
        }
      }
      if (changed.length + changedInputs.length > 100) throw new Error("Python produced more than 100 output files. Save only the files needed for this request.");
      const files: string[] = [];
      // Snapshot the whole working tree so relative HTML/image/script links keep
      // working and later Python calls cannot mutate an earlier Library revision.
      if (changed.length || changedInputs.length) {
        for (const [path] of current) {
          const target = join(snapshotDirectory, relative(output, path));
          mkdirSync(dirname(target), { recursive: true }); copyFileSync(path, target);
        }
        for (const [path] of changed) files.push(join(snapshotDirectory, relative(output, path)));
        for (const [path, name] of changedInputs) {
          const target = join(snapshotDirectory, name);
          mkdirSync(dirname(target), { recursive: true }); copyFileSync(path, target); files.push(target);
        }
      }
      saveOutputPublicationState(output, current);
      return { exitCode: 0, stdout, stderr, python, files, outputDirectory: output, snapshotDirectory };
    } catch (error) {
      const failure = error as Error & { code?: number | string; stdout?: string; stderr?: string; killed?: boolean };
      return { exitCode: typeof failure.code === "number" ? failure.code : -1, stdout: failure.stdout ?? "", stderr: failure.stderr || failure.message, timedOut: Boolean(failure.killed), python, files: [] as string[], outputDirectory: output, snapshotDirectory };
    }
  }
}
