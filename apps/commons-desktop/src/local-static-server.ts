import { createServer, type Server } from "node:http";
import { createReadStream, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative } from "node:path";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

export type StaticAppServer = { origin: string; close: () => void };

/**
 * Serves a folder containing a built web app (an index.html plus assets) on a
 * loopback port. Paths are resolved inside the folder only, symlinks included,
 * and unknown routes fall back to index.html for single-page apps.
 */
export function serveStaticApp(directory: string): Promise<StaticAppServer> {
  const root = realpathSync(directory);
  if (!statSync(join(root, "index.html"), { throwIfNoEntry: false })?.isFile()) {
    return Promise.reject(new Error("This app folder has no index.html. Add a build command or build the app first."));
  }
  const server: Server = createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    let path: string;
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      const requested = join(root, pathname);
      const resolved = realpathSync(statSync(requested, { throwIfNoEntry: false })?.isFile() ? requested : join(root, "index.html"));
      const offset = relative(root, resolved);
      if (offset.startsWith("..") || isAbsolute(offset)) throw new Error("outside");
      path = resolved;
    } catch {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[extname(path).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(path).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not start the Local app server."));
        return;
      }
      resolve({ origin: `http://127.0.0.1:${address.port}`, close: () => server.close() });
    });
  });
}
