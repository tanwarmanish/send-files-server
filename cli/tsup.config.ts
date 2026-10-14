import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  // node-datachannel ships a native addon, so it must stay external.
  external: ['node-datachannel', 'ws'],
});
