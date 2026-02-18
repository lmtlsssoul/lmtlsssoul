/**
 * @file Implements the queued role runner.
 * @author Gemini
 */

import { AgentRole } from '../substrate/assignment.js';

/**
 * Defines the structure of a job to be processed by the role runner.
 * This is based on the architecture document.
 */
export type RoleJob = {
  jobId: string;
  role: AgentRole;
  substrate: string;
  modelId: string;
  inputs: {
    kernelSnapshotRef: string;
    memorySlicesRef: string[];
    taskRef: string;
    toolPolicyRef: string;
  };
  outputs: {
    artifactPaths: string[];
    archiveAppendRef: string;
  };
  verify: {
    commands: string[];
  };
  createdAt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
};

/**
 * A single-lane job queue for processing role-based jobs.
 */
export class JobQueue {
  private queue: RoleJob[] = [];
  private isProcessing = false;

  /**
   * Adds a new job to the queue.
   * @param job - The job to add.
   */
  public addJob(job: Omit<RoleJob, 'status'>): void {
    this.queue.push({ ...job, status: 'pending' });
    this.processQueue();
  }

  /**
   * Processes the jobs in the queue one by one.
   * This is a conceptual implementation and does not perform actual work.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const job = this.queue.shift();

    if (job) {
      try {
        job.status = 'running';
        console.log(`Processing job ${job.jobId} for role ${job.role}`);

        // Conceptual: Read state -> perform -> write -> verify -> checkpoint
        await this.performJob(job);

        job.status = 'completed';
        console.log(`Job ${job.jobId} completed successfully.`);
      } catch (error) {
        job.status = 'failed';
        console.error(`Job ${job.jobId} failed:`, error);
      }
    }

    this.isProcessing = false;
    this.processQueue();
  }

  /**
   * A placeholder for the actual job execution logic.
   * @param job - The job to perform.
   */
  private async performJob(job: RoleJob): Promise<void> {
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`- Read state for job ${job.jobId}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`- Performed task for job ${job.jobId}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`- Wrote output for job ${job.jobId}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`- Verified job ${job.jobId}`);
  }
}
