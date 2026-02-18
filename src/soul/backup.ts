import fs from 'node:fs';
import path from 'node:path';
import type { Checkpoint } from './types.ts';

const BACKUPS_DIRNAME = 'backups';

type BackupManifest = {
  snapshotId: string;
  createdAt: string;
  createdBy: string;
  checkpoint: Checkpoint;
  files: string[];
};

type WriteBackupParams = {
  stateDir: string;
  checkpoint: Checkpoint;
  createdBy: string;
};

/**
 * Writes a versioned snapshot containing the current checkpoint manifest and
 * core runtime artifacts required for restore.
 */
export function writeCheckpointBackup(params: WriteBackupParams): string | null {
  if (params.stateDir === ':memory:') {
    return null;
  }

  const snapshotId =
    `v${String(params.checkpoint.version).padStart(6, '0')}-${params.checkpoint.checkpointId}`;
  const snapshotDir = path.join(params.stateDir, BACKUPS_DIRNAME, snapshotId);
  fs.mkdirSync(snapshotDir, { recursive: true });

  const filesToCopy = discoverStateFiles(params.stateDir);
  const copied: string[] = [];
  for (const relativeFile of filesToCopy) {
    const sourcePath = path.join(params.stateDir, relativeFile);
    const targetPath = path.join(snapshotDir, relativeFile);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    copied.push(relativeFile);
  }

  const manifest: BackupManifest = {
    snapshotId,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
    checkpoint: params.checkpoint,
    files: copied.sort(),
  };
  const manifestPath = path.join(snapshotDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifestPath;
}

function discoverStateFiles(stateDir: string): string[] {
  const fixedFiles = new Set([
    'SOUL.md',
    'archive.db',
    'archive.db-shm',
    'archive.db-wal',
    'soul.db',
    'soul.db-shm',
    'soul.db-wal',
    'birth-config.json',
    'model-registry.json',
    'role-assignments.json',
    'grownup-mode.json',
  ]);

  const collected: string[] = [];
  const entries = fs.readdirSync(stateDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const keep =
      fixedFiles.has(entry.name) ||
      entry.name.endsWith('.jsonl');
    if (!keep) {
      continue;
    }
    collected.push(entry.name);
  }

  return collected;
}
