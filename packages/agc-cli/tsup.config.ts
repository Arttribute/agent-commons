import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bin.ts'],
  outDir: 'dist',
  format: ['cjs'],
  target: 'node18',
  shims: true,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
});
