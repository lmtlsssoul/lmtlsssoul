import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  deriveGrownupCapabilities,
  getGrownupModePath,
  readGrownupMode,
  scanDeepestPermissions,
  setGrownupMode,
} from './modes.js';

describe('grownup mode', () => {
  it('defaults to disabled when no state file exists', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmtlss-grownup-default-'));
    const mode = readGrownupMode(tempDir);
    expect(mode.enabled).toBe(false);
    expect(mode.updatedAt).toBe('');
  });

  it('persists grownup mode changes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmtlss-grownup-set-'));
    const next = setGrownupMode(true, { stateDir: tempDir, updatedBy: 'author_cli' });
    expect(next.enabled).toBe(true);

    const saved = JSON.parse(fs.readFileSync(getGrownupModePath(tempDir), 'utf-8')) as { enabled: boolean };
    expect(saved.enabled).toBe(true);
  });

  it('derives root activation only when grownup mode and root are both true', () => {
    const offCapabilities = deriveGrownupCapabilities(
      { enabled: false, updatedAt: '', updatedBy: '' },
      {
        scan: {
          substrate: 'linux',
          cloud: false,
          currentPrivilege: 'standard',
          deepestPrivilege: 'root',
          escalationStrategy: 'sudo',
          notes: [],
        },
      }
    );
    expect(offCapabilities.rootAccessActive).toBe(false);
    expect(offCapabilities.selfOptimize).toBe(false);

    const onCapabilities = deriveGrownupCapabilities(
      { enabled: true, updatedAt: '', updatedBy: '' },
      {
        scan: {
          substrate: 'linux',
          cloud: false,
          currentPrivilege: 'standard',
          deepestPrivilege: 'root',
          escalationStrategy: 'sudo',
          notes: [],
        },
      }
    );
    expect(onCapabilities.rootAccessActive).toBe(true);
    expect(onCapabilities.selfAuthor).toBe(true);
    expect(onCapabilities.privilegeLevel).toBe('root');
  });

  it('scans deepest permissions with a stable output shape', () => {
    const scan = scanDeepestPermissions();
    expect(['linux', 'macos', 'windows', 'wsl', 'unknown']).toContain(scan.substrate);
    expect(['standard', 'root']).toContain(scan.currentPrivilege);
    expect(['standard', 'root']).toContain(scan.deepestPrivilege);
    expect(Array.isArray(scan.notes)).toBe(true);
  });
});
