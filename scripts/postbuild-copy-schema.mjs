#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'src', 'schema');
const targetDirs = [
  path.join(projectRoot, 'dist', 'schema'),
  path.join(projectRoot, 'schema'),
];

if (!fs.existsSync(sourceDir)) {
  console.error(`Schema source directory not found: ${sourceDir}`);
  process.exit(1);
}

for (const targetDir of targetDirs) {
  fs.mkdirSync(targetDir, { recursive: true });
}

for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.sql')) {
    continue;
  }
  const from = path.join(sourceDir, entry.name);
  for (const targetDir of targetDirs) {
    const to = path.join(targetDir, entry.name);
    fs.copyFileSync(from, to);
  }
}

console.log(`Copied SQL schemas to ${targetDirs.join(', ')}`);
