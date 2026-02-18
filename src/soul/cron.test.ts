import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CronAutonomics } from './cron.ts';
import { Reflection } from '../agents/reflection.ts';
import { Scraper } from '../agents/scraper.ts';
import { Orchestrator } from '../agents/orchestrator.ts';
import { ArchiveDB } from './archive-db.ts';
import { GraphDB } from './graph-db.ts';
import { SoulCompiler } from './compiler.ts';

describe('CronAutonomics', () => {
  let reflection: Reflection;
  let scraper: Scraper;
  let orchestrator: Orchestrator;
  let archiveDb: ArchiveDB;
  let graphDb: GraphDB;
  let compiler: SoulCompiler;
  let cron: CronAutonomics;

  beforeEach(() => {
    // Mock agents
    reflection = {
      execute: vi.fn().mockResolvedValue({}),
    } as unknown as Reflection;

    scraper = {
      execute: vi.fn().mockResolvedValue({}),
    } as unknown as Scraper;

    orchestrator = {
      monitorGoals: vi.fn(),
    } as unknown as Orchestrator;

    // Mock DBs
    archiveDb = {
      optimize: vi.fn(),
    } as unknown as ArchiveDB;

    graphDb = {
      optimize: vi.fn(),
    } as unknown as GraphDB;

    compiler = {
      regenerateCapsule: vi.fn(),
    } as unknown as SoulCompiler;

    cron = new CronAutonomics(
      reflection,
      scraper,
      orchestrator,
      archiveDb,
      graphDb,
      compiler,
      'SOUL.md'
    );
  });

  it('should start and stop autonomics', () => {
    vi.useFakeTimers();
    cron.start();
    // Verify timers are set
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    
    cron.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('should trigger reflection job', async () => {
    vi.useFakeTimers();
    cron.start();
    
    // Advance time by 30 minutes
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 100);
    
    expect(reflection.execute).toHaveBeenCalledWith({ mode: 'cron' });
    
    cron.stop();
    vi.useRealTimers();
  });

  it('should trigger goal check job', async () => {
    vi.useFakeTimers();
    cron.start();
    
    // Advance time by 10 minutes
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 100);
    
    expect(orchestrator.monitorGoals).toHaveBeenCalled();
    
    cron.stop();
    vi.useRealTimers();
  });

  it('should run maintenance tasks', async () => {
    // Testing the maintenance logic (calling private method via cast)
    await (cron as any).runMaintenance();
    
    expect(graphDb.optimize).toHaveBeenCalled();
    expect(archiveDb.optimize).toHaveBeenCalled();
    expect(compiler.regenerateCapsule).toHaveBeenCalledWith('SOUL.md');
  });
});
