import { spawn } from 'node:child_process';
import type { RoleJob } from './types.ts';
import { saveQueueState } from './resume.ts';

type RunnerJob = RoleJob & { status: 'queued' | 'running' | 'completed' | 'failed' };

export type VerificationOutcome = {
  command: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type QueueSnapshot = {
  pending: RunnerJob[];
  active: RunnerJob | null;
  processed: RunnerJob[];
};

type JobExecutor = (job: RunnerJob) => Promise<void>;
type VerifyRunner = (command: string) => Promise<VerificationOutcome>;

export class JobQueue {
  private queue: RunnerJob[] = [];
  private processed: RunnerJob[] = [];
  private active: RunnerJob | null = null;
  private isProcessing = false;

  constructor(
    private readonly options?: {
      executor?: JobExecutor;
      verifyRunner?: VerifyRunner;
      checkpoint?: (jobs: RunnerJob[]) => Promise<void>;
      onStateChange?: (snapshot: QueueSnapshot) => void;
    }
  ) {}

  public addJob(job: Omit<RunnerJob, 'status'>): void {
    this.queue.push({ ...job, status: 'queued' });
    void this.persistState();
    void this.processQueue();
  }

  public addJobs(jobs: Omit<RunnerJob, 'status'>[]): void {
    for (const job of jobs) {
      this.queue.push({ ...job, status: 'queued' });
    }
    void this.persistState();
    void this.processQueue();
  }

  public getPendingJobs(): RunnerJob[] {
    return [...this.queue];
  }

  public getProcessedJobs(): RunnerJob[] {
    return [...this.processed];
  }

  public getActiveJob(): RunnerJob | null {
    return this.active ? { ...this.active } : null;
  }

  public getSnapshot(): QueueSnapshot {
    return {
      pending: this.getPendingJobs(),
      active: this.getActiveJob(),
      processed: this.getProcessedJobs(),
    };
  }

  public isIdle(): boolean {
    return !this.isProcessing && this.queue.length === 0 && this.active === null;
  }

  public async waitForIdle(timeoutMs: number = 60000): Promise<boolean> {
    const start = Date.now();
    while (!this.isIdle()) {
      if (Date.now() - start > timeoutMs) {
        return false;
      }
      await delay(20);
    }
    return true;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift();
        if (!job) {
          break;
        }

        this.active = job;
        job.status = 'running';
        job.startedAt = new Date().toISOString();
        await this.persistState();

        try {
          await this.runExecution(job);
          const verification = await this.runVerification(job);
          const failedCheck = verification.find((check) => !check.ok);
          if (failedCheck) {
            throw new Error(`Verification failed for "${failedCheck.command}" (exit ${failedCheck.exitCode ?? -1})`);
          }

          job.status = 'completed';
          job.completedAt = new Date().toISOString();
        } catch (err) {
          job.status = 'failed';
          job.completedAt = new Date().toISOString();
          job.error = err instanceof Error ? err.message : String(err);
        }

        this.processed.push(job);
        this.active = null;
        await this.persistState();
      }
    } finally {
      this.isProcessing = false;
      this.emitState();
    }
  }

  private async runExecution(job: RunnerJob): Promise<void> {
    const executor = this.options?.executor ?? defaultExecutor;
    await executor(job);
  }

  private async runVerification(job: RunnerJob): Promise<VerificationOutcome[]> {
    const verifyRunner = this.options?.verifyRunner ?? defaultVerifyRunner;
    const results: VerificationOutcome[] = [];

    for (const command of job.verify.commands) {
      const result = await verifyRunner(command);
      results.push(result);
      if (!result.ok) {
        break;
      }
    }

    return results;
  }

  private async persistState(): Promise<void> {
    const checkpoint = this.options?.checkpoint ?? saveQueueState;
    const resumableJobs: RunnerJob[] = [
      ...(this.active ? [this.active] : []),
      ...this.queue,
    ];

    await checkpoint(resumableJobs);
    this.emitState();
  }

  private emitState(): void {
    this.options?.onStateChange?.(this.getSnapshot());
  }
}

async function defaultExecutor(): Promise<void> {
  // The default execution step is intentionally no-op.
  // Concrete job transformation is provided by queue clients.
}

async function defaultVerifyRunner(command: string): Promise<VerificationOutcome> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on('error', (err) => {
      resolve({
        command,
        ok: false,
        exitCode: null,
        stdout,
        stderr: `${stderr}\n${err.message}`.trim(),
      });
    });

    child.on('close', (code) => {
      resolve({
        command,
        ok: code === 0,
        exitCode: code,
        stdout,
        stderr,
      });
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
