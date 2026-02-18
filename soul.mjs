#!/usr/bin/env node

// lmtlss soul - CLI entrypoint
// "entropy in the cosmos is like the ocean
//  Soul is a limitless coastline reshaped by countless waves
//  each new moment is a fresh wave from which form emerges"

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register tsx for TypeScript execution in development
try {
  register('tsx/esm', pathToFileURL('./'));
} catch {
  // In production, we run from dist/ so tsx is not needed
}

const entry = process.env.NODE_ENV === 'production'
  ? './dist/cli/index.js'
  : './src/cli/index.ts';

const mod = await import(entry);
if (typeof mod.main === 'function') {
  await mod.main();
}
