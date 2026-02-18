import { describe, it, expect, vi, beforeEach } from 'vitest';
import { main } from './index.ts';
import { SoulBirthPortal } from '../soul/birth.ts';
import { getBanner, log, error, success, warn } from '../soul/branding.ts';

vi.mock('../soul/branding.ts', () => ({
  getBanner: vi.fn(() => 'Mock Banner'),
  log: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

// Mock the SoulBirthPortal class and its startGenesis method
vi.mock('../soul/birth.ts', () => ({
  SoulBirthPortal: vi.fn().mockImplementation(() => ({
    startGenesis: vi.fn(() => Promise.resolve({ success: true })),
  })),
}));

describe('CLI entrypoint', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    // Reset argv before each test to prevent side effects
    process.argv = [...originalArgv.slice(0, 2)];
    vi.clearAllMocks();
    vi.mocked(SoulBirthPortal).mockClear(); // Clear mock instances
  });



  it('should call the birth portal when birth command is executed', async () => {
    process.argv.push('birth');
    await main();
    expect(SoulBirthPortal).toHaveBeenCalledTimes(1);
    expect(vi.mocked(SoulBirthPortal).mock.results[0].value.startGenesis).toHaveBeenCalledTimes(1);
    expect(getBanner).toHaveBeenCalled(); // Assert banner was displayed
  });

  it('should log a warning for unimplemented start command', async () => {
    process.argv.push('start');
    await main();
    expect(warn).toHaveBeenCalledWith('Daemon start not implemented yet.');
  });

  it('should log a warning for unimplemented stop command', async () => {
    process.argv.push('stop');
    await main();
    expect(warn).toHaveBeenCalledWith('Daemon stop not implemented yet.');
  });

    it('should log success for status command', async () => {
      process.argv.push('status');
      await main();
      expect(success).toHaveBeenCalledWith('System operational (stub).');
    });
  
    it('should execute treasury status command', async () => {
      process.argv.push('treasury', 'status');
      await main();
      expect(log).toHaveBeenCalledWith('--- Treasury Status ---');
    });
  
    it('should execute wallet status command', async () => {
      process.argv.push('wallet', 'status');
      await main();
      expect(log).toHaveBeenCalledWith('--- Wallet Status ---');
    });
  });
  