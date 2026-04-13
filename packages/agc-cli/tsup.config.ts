import { defineConfig } from 'tsup';
import pkg from './package.json';

export default defineConfig({
  entry: ['src/bin.ts'],
  outDir: 'dist',
  format: ['cjs'],
  target: 'node18',
  shims: true,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  // Inject version from package.json at build time so `agc -v` always matches
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
});
