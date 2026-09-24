import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";

function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "localhost", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not select a loopback port for Commons."));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function desktopAuthSecret(userDataDirectory: string) {
  const path = join(userDataDirectory, "commons-app-auth-secret");
  try {
    const existing = readFileSync(path, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    // A new desktop installation needs a local signing key.
  }
  const secret = randomBytes(48).toString("base64url");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, secret, { mode: 0o600 });
  return secret;
}

export type CommonsAppServer = {
  origin: string;
  stop: () => void;
};

/**
 * Runs the actual commons-app build on loopback. Both workspace modes use this
 * app and its routing tree; mode-specific data and execution stay behind its
 * desktop provider. The process is stopped with the Electron window.
 */
export async function startCommonsAppServer(
  resourcesDirectory: string,
  userDataDirectory: string,
  electronExecutable = process.execPath,
): Promise<CommonsAppServer> {
  const bundledRoot = existsSync(join(resourcesDirectory, "commons-app", "apps", "commons-app", "server.js"))
    ? "commons-app"
    : "commons-app-dist";
  const appDirectory = join(resourcesDirectory, bundledRoot, "apps", "commons-app");
  const entry = join(appDirectory, "server.js");
  if (!existsSync(entry)) throw new Error("The bundled Commons app server is missing.");
  const port = await freeLoopbackPort();
  const origin = `http://localhost:${port}`;
  const child: ChildProcess = spawn(electronExecutable, [entry], {
    cwd: appDirectory,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      COMMONS_DESKTOP_SERVER: "1",
      PORT: String(port),
      HOSTNAME: "localhost",
      AUTH_URL: origin,
      AUTH_SECRET: desktopAuthSecret(userDataDirectory),
      COMMONS_IDENTITY_ISSUER: process.env.COMMONS_IDENTITY_ISSUER ?? "https://auth.agentcommons.io/api/auth",
      COMMONS_IDENTITY_CLIENT_ID: process.env.COMMONS_IDENTITY_CLIENT_ID ?? "commons-desktop",
      NEXT_PUBLIC_NEST_API_BASE_URL: process.env.NEXT_PUBLIC_NEST_API_BASE_URL ?? "https://api.agentcommons.io",
    },
  });
  let serverOutput = "";
  let spawnError = "";
  child.on("error", (error) => { spawnError = error.message; });
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (chunk) => {
    serverOutput = (serverOutput + chunk.toString()).slice(-2_000);
    if (process.env.COMMONS_DESKTOP_SMOKE_DEBUG === "1") process.stderr.write(`[commons-app] ${chunk.toString()}`);
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${origin}/desktop/auth`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return {
        origin,
        stop: () => { if (child.exitCode === null) child.kill(); },
      };
    } catch {
      // Next.js is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (child.exitCode === null) child.kill();
  throw new Error(`The bundled Commons app could not start.${spawnError ? ` ${spawnError}` : ""}${serverOutput ? `\n${serverOutput}` : ""}`);
}
