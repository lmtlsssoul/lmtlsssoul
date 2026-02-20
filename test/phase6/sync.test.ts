import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SyncManager } from '../../src/soul/sync.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('SyncManager', () => {
  let tempDir: string;
  let syncManager: SyncManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmtlss-sync-test-'));
    syncManager = new SyncManager(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should initialize a git repository', () => {
    const result = syncManager.init();
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.gitignore'))).toBe(true);
    
    const gitignore = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('*.db-shm');
  });

  it('should commit changes locally', () => {
    syncManager.init();
    
    // Create a dummy file
    fs.writeFileSync(path.join(tempDir, 'test.jsonl'), '{"event": "test"}');
    
    const result = syncManager.push('test commit');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('State committed locally');
  });

  it('should return ok when no changes to push', () => {
    syncManager.init();
    syncManager.push(); // Commits initial .gitignore
    const result = syncManager.push();
    expect(result.ok).toBe(true);
    expect(result.message).toBe('No changes to push.');
  });
});
