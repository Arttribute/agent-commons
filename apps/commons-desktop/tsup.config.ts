import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main.ts",
    "preload-cloud": "src/preload-cloud.ts",
    "preload-local": "src/preload-local.ts"
  },
  format: ["cjs"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  outExtension: () => ({ js: ".cjs" }),
  external: ["electron"],
  // Workspace packages are copied into app.asar as source packages. Bundle
  // runtime imports so Electron never has to execute TypeScript in node_modules.
  noExternal: ["@agent-commons/desktop-contract", "@agent-commons/cli"]
});
