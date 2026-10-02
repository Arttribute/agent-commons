// Copies pdf.js's own browser build into public/ so the canvas can load it
// without webpack re-bundling it (which breaks pdf.js's module runtime).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "vendor", "pdfjs");
mkdirSync(target, { recursive: true });
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
  copyFileSync(path.join(root, "build", file), path.join(target, file));
}
