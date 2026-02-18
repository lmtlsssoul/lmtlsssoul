#!/usr/bin/env node

// lmtlss soul - CLI entrypoint
// "entropy in the cosmos is like the ocean
//  Soul is a limitless coastline reshaped by countless waves
//  each new moment is a fresh wave from which form emerges"

import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceEntry = path.join(__dirname, 'src', 'cli', 'index.ts');
const distEntry = path.join(__dirname, 'dist', 'index.js');

async function loadCliModule() {
  const preferDist = process.env.NODE_ENV === 'production' || !fs.existsSync(sourceEntry);
  if (preferDist) {
    if (!fs.existsSync(distEntry)) {
      throw new Error(
        'Missing dist build artifacts. Run "pnpm run build" before production execution.'
      );
    }
    return import(pathToFileURL(distEntry).href);
  }

  try {
    register('tsx/esm', pathToFileURL('./'));
    return import(pathToFileURL(sourceEntry).href);
  } catch {
    if (!fs.existsSync(distEntry)) {
      throw new Error(
        'Unable to load TypeScript runtime and no dist fallback found. Run "pnpm run build".'
      );
    }
    return import(pathToFileURL(distEntry).href);
  }
}

const mod = await loadCliModule();
const main = mod.main ?? mod.cliMain;

if (typeof main === 'function') {
  await main();
}
