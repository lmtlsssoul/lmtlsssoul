import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from './index.ts';
import { SoulBirthPortal } from '../soul/birth.ts';
import { printBanner, log, error, success, warn } from '../soul/branding.ts';
import { spawn } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const child: {
      pid: number;
      unref: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
    } = {
      pid: 4242,
      unref: vi.fn(),
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        if (event === 'exit') {
          cb(0, null);
        }
        return child;
      }),
    };
    return child;
  }),
  spawnSync: vi.fn(() => ({
    status: 1,
    stdout: '',
  })),
}));

vi.mock('../soul/branding.ts', () => ({
  getBanner: vi.fn(() => 'Mock Banner'),
  printBanner: vi.fn(() => Promise.resolve()),
  log: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../soul/birth.ts', () => ({
  SoulBirthPortal: vi.fn().mockImplementation(() => ({
    startGenesis: vi.fn(() => Promise.resolve({ success: true })),
  })),
}));

vi.mock('enquirer', () => ({
  default: {
    prompt: vi.fn((options?: { message?: string }) => {
      const message = options?.message ?? '';
      if (message.includes('Scrying terminal controls')) {
        return Promise.resolve({ value: 'Open Birth Portal' });
      }
      if (message.includes('Soul command menu')) {
        return Promise.resolve({ value: 'Exit' });
      }
      return Promise.resolve({ value: '' });
    }),
  },
}));

describe('CLI entrypoint', () => {
  const originalArgv = process.argv;
  const originalStateDir = process.env.LMTLSS_STATE_DIR;
  let tempStateDir: string;

  beforeEach(() => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmtlss-cli-test-'));
    process.env.LMTLSS_STATE_DIR = tempStateDir;
    process.argv = [...originalArgv.slice(0, 2)];
    vi.clearAllMocks();
    vi.mocked(SoulBirthPortal).mockClear();
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (originalStateDir) {
      process.env.LMTLSS_STATE_DIR = originalStateDir;
    } else {
      delete process.env.LMTLSS_STATE_DIR;
    }
    fs.rmSync(tempStateDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('calls the birth portal when birth command is executed', async () => {
    process.argv.push('birth');
    await main();
    expect(spawn).toHaveBeenCalled();
    const spawnedArgs = vi.mocked(spawn).mock.calls[0]?.[1];
    expect(Array.isArray(spawnedArgs)).toBe(true);
    expect((spawnedArgs as string[]).some((arg) => arg.includes('lmtlss_scryer.py') || arg.includes('art.9.py'))).toBe(true);
    expect(SoulBirthPortal).toHaveBeenCalledTimes(1);
    expect(vi.mocked(SoulBirthPortal).mock.results[0].value.startGenesis).toHaveBeenCalledTimes(1);
    expect(printBanner).toHaveBeenCalled();
  });

  it('launches portal home screen when no subcommand is provided', async () => {
    await main();

    expect(spawn).toHaveBeenCalled();
    const spawnedArgs = vi.mocked(spawn).mock.calls[0]?.[1];
    expect(Array.isArray(spawnedArgs)).toBe(true);
    expect((spawnedArgs as string[]).some((arg) => arg.includes('lmtlss_scryer.py') || arg.includes('art.9.py'))).toBe(true);
    expect(SoulBirthPortal).not.toHaveBeenCalled();
  });

  it('starts daemon command and records daemon state', async () => {
    const originalCwd = process.cwd();
    const unrelatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmtlss-cli-cwd-'));
    try {
      process.chdir(unrelatedDir);
      process.argv.push('start', '--port', '3011', '--host', '127.0.0.1');
      await main();

      expect(spawn).toHaveBeenCalled();
      const spawnedArgs = vi.mocked(spawn).mock.calls[0]?.[1];
      expect(Array.isArray(spawnedArgs)).toBe(true);
      const entrypoint = (spawnedArgs as string[])[0];
      expect(path.basename(entrypoint)).toBe('soul.mjs');
      expect(fs.existsSync(entrypoint)).toBe(true);
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Daemon (the other kind) started'));
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(unrelatedDir, { recursive: true, force: true });
    }
  });

  it('stops daemon command when state exists', async () => {
    const daemonPath = path.join(tempStateDir, 'daemon.json');
    fs.writeFileSync(
      daemonPath,
      JSON.stringify(
        {
          pid: process.pid,
          host: '127.0.0.1',
          port: 3000,
          startedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    process.argv.push('stop');
    await main();
    expect(killSpy).toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Daemon (the other kind) process'));
  });

  it('reports status command', async () => {
    process.argv.push('status');
    await main();
    expect(log).toHaveBeenCalledWith('--- Soul Omens ---');
  });

  it('toggles grownup mode on and persists state', async () => {
    process.argv.push('grownup', 'on');
    await main();

    expect(success).toHaveBeenCalledWith(expect.stringContaining('Grownup mode enabled'));
    const modePath = path.join(tempStateDir, 'grownup-mode.json');
    const saved = JSON.parse(fs.readFileSync(modePath, 'utf-8')) as { enabled: boolean };
    expect(saved.enabled).toBe(true);
  });

  it('shows grownup mode status with no argument', async () => {
    process.argv.push('grownup');
    await main();
    expect(log).toHaveBeenCalledWith('--- Grownup Mode ---');
  });

  it('launches terminal art command', async () => {
    process.argv.push('art');
    await main();

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.stringMatching(/lmtlss_scryer\.py|art\.9\.py/)]),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('verifies archive hash-chain command', async () => {
    process.argv.push('archive', 'verify');
    await main();
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Archive hash-chain verified'));
  });

  it('executes treasury status command', async () => {
    process.argv.push('treasury', 'status');
    await main();
    expect(log).toHaveBeenCalledWith('--- Treasury Status ---');
  });

  it('executes wallet status command', async () => {
    process.argv.push('wallet', 'status');
    await main();
    expect(log).toHaveBeenCalledWith('--- Wallet Status ---');
  });
});
