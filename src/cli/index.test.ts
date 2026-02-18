import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from './index.ts';
import { SoulBirthPortal } from '../soul/birth.ts';
import { getBanner, log, error, success, warn } from '../soul/branding.ts';
import { spawn } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 4242,
    unref: vi.fn(),
  })),
}));

vi.mock('../soul/branding.ts', () => ({
  getBanner: vi.fn(() => 'Mock Banner'),
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
    expect(SoulBirthPortal).toHaveBeenCalledTimes(1);
    expect(vi.mocked(SoulBirthPortal).mock.results[0].value.startGenesis).toHaveBeenCalledTimes(1);
    expect(getBanner).toHaveBeenCalled();
  });

  it('starts daemon command and records daemon state', async () => {
    process.argv.push('start', '--port', '3011', '--host', '127.0.0.1');
    await main();

    expect(spawn).toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Daemon started'));
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
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Daemon process'));
  });

  it('reports status command', async () => {
    process.argv.push('status');
    await main();
    expect(log).toHaveBeenCalledWith('--- Soul Status ---');
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
