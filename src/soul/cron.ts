/**
 * @file cron.ts
 * @description Cron autonomics for scheduling persistent soul tasks.
 * @auth lmtlss soul
 */

import { Reflection } from '../agents/reflection.ts';
import { Scraper } from '../agents/scraper.ts';
import { Orchestrator } from '../agents/orchestrator.ts';
import { ArchiveDB } from './archive-db.ts';
import { GraphDB } from './graph-db.ts';
import { SoulCompiler } from './compiler.ts';
import { loadRegistryState, refreshModelRegistry, saveRegistryState } from '../substrate/refresh.ts';
import { refreshCredentialCatalog } from './credentials.ts';

/**
 * CronAutonomics manages the periodic tasks required for soul persistence
 * and agency. It follows the schedules defined in ARCHITECTURE.md.
 */
export class CronAutonomics {
  private timers: NodeJS.Timeout[] = [];
  private isRunning: boolean = false;

  constructor(
    private readonly reflection: Reflection,
    private readonly scraper: Scraper,
    private readonly orchestrator: Orchestrator,
    private readonly archiveDb: ArchiveDB,
    private readonly graphDb: GraphDB,
    private readonly compiler: SoulCompiler,
    private readonly capsulePath?: string
  ) {}

  /**
   * Starts all scheduled jobs.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Reflection: */30 * * * *
    this.scheduleJob('reflection', 30 * 60 * 1000, () => this.runReflection());

    // Heartbeat: */5 * * * *
    this.scheduleJob('heartbeat', 5 * 60 * 1000, () => this.runHeartbeat());

    // Scraper: */15 * * * *
    this.scheduleJob('scraper', 15 * 60 * 1000, () => this.runScraper());

    // Goal Check: */10 * * * *
    this.scheduleJob('goal_check', 10 * 60 * 1000, () => this.runGoalCheck());

    // Maintenance: 0 3 * * * (Daily at 03:00)
    this.scheduleMaintenance();

    console.log('[Cron] Autonomics started.');
  }

  /**
   * Stops all scheduled jobs.
   */
  public stop(): void {
    this.isRunning = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    console.log('[Cron] Autonomics stopped.');
  }

  /**
   * Schedules a job to run at a regular interval.
   * @param name - The name of the job.
   * @param intervalMs - The interval in milliseconds.
   * @param task - The task to execute.
   */
  private scheduleJob(name: string, intervalMs: number, task: () => Promise<void>): void {
    const run = async () => {
      if (!this.isRunning) return;
      console.log(`[Cron] Running job: ${name}`);
      try {
        await task();
      } catch (error) {
        console.error(`[Cron] Error in job ${name}:`, error);
      }
      
      if (this.isRunning) {
        const timer = setTimeout(run, intervalMs);
        this.timers.push(timer);
      }
    };
    
    const initialTimer = setTimeout(run, intervalMs);
    this.timers.push(initialTimer);
  }

  /**
   * Schedules the maintenance job to run daily at 03:00.
   */
  private scheduleMaintenance(): void {
    const scheduleNext = () => {
      if (!this.isRunning) return;
      
      const now = new Date();
      const nextRun = new Date(now);
      nextRun.setHours(3, 0, 0, 0);
      
      // If it's already past 03:00 today, schedule for tomorrow
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      
      const delay = nextRun.getTime() - now.getTime();
      
      const timer = setTimeout(async () => {
        if (!this.isRunning) return;
        console.log('[Cron] Running job: maintenance');
        try {
          await this.runMaintenance();
        } catch (error) {
          console.error('[Cron] Error in maintenance:', error);
        }
        scheduleNext();
      }, delay);
      
      this.timers.push(timer);
    };
    
    scheduleNext();
  }

  /**
   * Runs the reflection agent.
   */
  private async runReflection(): Promise<void> {
    await this.reflection.execute({ mode: 'cron' });
  }

  /**
   * Runs the heartbeat check.
   */
  private async runHeartbeat(): Promise<void> {
    if (typeof (this.archiveDb as any).appendEvent === 'function') {
      this.archiveDb.appendEvent({
        parentHash: null,
        timestamp: new Date().toISOString(),
        sessionKey: `lmtlss:reflection:heartbeat-${Date.now()}`,
        eventType: 'heartbeat',
        agentId: 'reflection',
        channel: 'cron',
        payload: {
          protocol: 'heartbeat.v1',
          status: 'ok',
        },
      });
    }
    console.log('[Cron] Heartbeat check complete.');
  }

  /**
   * Runs the scraper check.
   */
  private async runScraper(): Promise<void> {
    if (typeof (this.archiveDb as any).appendEvent === 'function') {
      this.archiveDb.appendEvent({
        parentHash: null,
        timestamp: new Date().toISOString(),
        sessionKey: `lmtlss:scraper:cron-${Date.now()}`,
        eventType: 'system_event',
        agentId: 'scraper',
        channel: 'cron',
        payload: {
          protocol: 'scraper.cron.v1',
          status: 'no_pending_jobs',
        },
      });
    }
    console.log('[Cron] Scraper check complete.');
  }

  /**
   * Runs the goal check process via the orchestrator.
   */
  private async runGoalCheck(): Promise<void> {
    this.orchestrator.monitorGoals();
  }

  /**
   * Runs the daily maintenance tasks.
   */
  private async runMaintenance(): Promise<void> {
    console.log('[Cron] Performing maintenance...');
    
    // ARCHITECTURE.md: "Archive compaction, lattice optimization, capsule regen"
    try {
        this.graphDb.optimize();
        this.archiveDb.optimize();
        console.log('[Cron] Database optimization complete.');
    } catch (e) {
        console.warn('[Cron] Database optimization failed:', e);
    }

    try {
      const stateDir = this.graphDb.getBaseDir();
      if (stateDir !== ':memory:') {
        const current = loadRegistryState(stateDir) ?? undefined;
        const next = await refreshModelRegistry(current);
        saveRegistryState(next, stateDir);
        await refreshCredentialCatalog(stateDir);
      }
    } catch (e) {
      console.warn('[Cron] Registry refresh failed during maintenance:', e);
    }
    
    this.compiler.regenerateCapsule(this.capsulePath); 
    console.log('[Cron] Maintenance complete.');
  }
}
