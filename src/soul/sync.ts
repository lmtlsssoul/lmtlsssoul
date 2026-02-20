import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { log, error, success, warn } from './branding.ts';
import { GraphDB } from './graph-db.ts';
import { ArchiveDB } from './archive-db.ts';

/**
 * SyncResult represents the outcome of a sync operation.
 */
export type SyncResult = {
  ok: boolean;
  message: string;
  details?: string;
};

/**
 * SyncManager handles multi-device synchronization of the Soul state.
 * It uses Git as the underlying transport and versioning layer for the
 * Soul lattice (SQLite) and Raw Archive (JSONL).
 *
 * Derived from whitepaper.pdf Section 2, 7, 14.
 */
export class SyncManager {
  private stateDir: string;

  constructor(stateDir: string) {
    this.stateDir = path.resolve(stateDir);
  }

  /**
   * Initializes the state directory for synchronization.
   * Creates a .gitignore if it doesn't exist and initializes a git repository.
   */
  public init(remoteUrl?: string): SyncResult {
    try {
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true });
      }

      const gitDir = path.join(this.stateDir, '.git');
      if (!fs.existsSync(gitDir)) {
        log(`Initializing git repository in ${this.stateDir}...`);
        this.runGit(['init', '-b', 'main']);
      }

      this.ensureGitIgnore();

      // Configure local git author identity if not set
      this.runGit(['config', 'user.name', 'lmtlss soul']);
      this.runGit(['config', 'user.email', 'soul@lmtlss.org']);

      if (remoteUrl) {
        this.runGit(['remote', 'add', 'origin', remoteUrl]);
      }

      return { ok: true, message: 'Sync initialized successfully.' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: 'Failed to initialize sync.', details: msg };
    }
  }

  /**
   * Commits current state and pushes to remote.
   */
  public push(message: string = `Soul Checkpoint: ${new Date().toISOString()}`): SyncResult {
    try {
      // Flush any active SQLite databases if they exist in the state dir
      if (fs.existsSync(path.join(this.stateDir, 'soul.db'))) {
        const gdb = new GraphDB(this.stateDir);
        gdb.checkpoint();
      }
      if (fs.existsSync(path.join(this.stateDir, 'archive.db'))) {
        const adb = new ArchiveDB(this.stateDir);
        adb.checkpoint();
      }

      this.runGit(['add', '.']);
      
      // Check if there are changes to commit
      const status = this.runGit(['status', '--porcelain']);
      if (!status.stdout.toString().trim()) {
        return { ok: true, message: 'No changes to push.' };
      }

      this.runGit(['commit', '-m', message]);
      
      const remoteCheck = this.runGit(['remote']);
      if (remoteCheck.stdout.toString().includes('origin')) {
        log('Pushing to remote origin...');
        this.runGit(['push', 'origin', 'main']);
        return { ok: true, message: 'State pushed successfully.' };
      } else {
        return { ok: true, message: 'State committed locally (no remote configured).' };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: 'Failed to push state.', details: msg };
    }
  }

  /**
   * Pulls latest state from remote and merges.
   */
  public pull(): SyncResult {
    try {
      const remoteCheck = this.runGit(['remote']);
      if (!remoteCheck.stdout.toString().includes('origin')) {
        return { ok: false, message: 'No remote "origin" configured for pull.' };
      }

      log('Pulling from remote origin...');
      
      // Check if we have a local main branch
      const branchCheck = spawnSync('git', ['rev-parse', '--verify', 'main'], { cwd: this.stateDir });
      
      if (branchCheck.status !== 0) {
        // No local main yet: bootstrap from remote and force-align working tree.
        this.runGit(['fetch', 'origin', 'main']);
        this.runGit(['checkout', '-B', 'main', 'origin/main', '--force']);
      } else {
        // Use rebase to keep history clean as per "append-only" spirit where possible,
        // though binary SQLite files will just conflict and need resolution.
        this.runGit(['pull', 'origin', 'main', '--rebase']);
      }
      
      return { ok: true, message: 'State pulled successfully.' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: 'Failed to pull state.', details: msg };
    }
  }

  /**
   * Full sync cycle: Pull -> Push.
   */
  public sync(): SyncResult {
    const pullRes = this.pull();
    if (!pullRes.ok && !pullRes.message.includes('No remote "origin"')) {
      return pullRes;
    }
    return this.push();
  }

  private ensureGitIgnore(): void {
    const ignorePath = path.join(this.stateDir, '.gitignore');
    const expectedContent = [
      '*.db-shm',
      '*.db-wal',
      'daemon.json',
      'node_modules/',
      '.DS_Store',
    ].join('\n');

    if (!fs.existsSync(ignorePath)) {
      fs.writeFileSync(ignorePath, expectedContent, 'utf-8');
    } else {
      let currentContent = fs.readFileSync(ignorePath, 'utf-8');
      let changed = false;
      for (const line of expectedContent.split('\n')) {
        if (!currentContent.includes(line)) {
          currentContent += `\n${line}`;
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(ignorePath, currentContent, 'utf-8');
      }
    }
  }

  private runGit(args: string[]) {
    const res = spawnSync('git', args, { cwd: this.stateDir });
    if (res.status !== 0) {
      const stderr = res.stderr.toString();
      throw new Error(`Git command failed: git ${args.join(' ')}
${stderr}`);
    }
    return res;
  }
}
