import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./renderer", import.meta.url)),
  // The production renderer is loaded with BrowserWindow.loadFile(), so every
  // emitted asset URL must remain relative to renderer-dist/index.html.
  base: "./",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL("./renderer-dist", import.meta.url)),
    emptyOutDir: true
  },
  resolve: {
    // Shared UI files live under commons-app, which also has React installed.
    // Force one renderer copy so hooks and react-dom share the same dispatcher.
    dedupe: ["react", "react-dom"],
    alias: {
      "@commons-desktop-ui": fileURLToPath(
        new URL("../commons-app/components/desktop", import.meta.url)
      )
    }
  }
});
