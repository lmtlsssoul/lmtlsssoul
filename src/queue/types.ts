/**
 * Queued Role Cognition types.
 * Derived from whitepaper.pdf Section 17.
 *
 * Local inference is optimized for continuity over throughput.
 * Roles execute in a queue, one job at a time.
 */

import type { AgentRole } from '../soul/types.ts';
import type { SubstrateId } from '../substrate/types.ts';

/** A single role job in the execution queue. */
export type RoleJob = {
  jobId: string;
  role: AgentRole;
  substrate: SubstrateId;
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
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};
