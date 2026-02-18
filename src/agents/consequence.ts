/**
 * @file src/agents/consequence.ts
 * @description Consequence measurement protocol for post-task outcome analysis.
 * @auth lmtlss soul
 */

import { ArchiveDB } from '../soul/archive-db.ts';
import { GraphDB } from '../soul/graph-db.ts';
import { SoulCompiler } from '../soul/compiler.ts';
import { generateSessionKey } from '../soul/session-key.ts';
import type { latticeUpdateProposal } from '../soul/types.ts';
import type { AgentRole } from './types.ts';
import type { VerificationResult } from './verify.ts';

export const CONSEQUENCE_CHANNEL = 'consequence';
export const CONSEQUENCE_PROTOCOL = 'consequence.v1';

const CONSEQUENCE_AGENT_ID: AgentRole = 'reflection';

export type ConsequenceOutcome = 'positive' | 'negative' | 'mixed';

export type ConsequenceMeasurementInput = {
  goalId: string;
  taskId: string;
  verification: VerificationResult;
  expectedSalience?: number;
  sessionKey?: string;
  notes?: string;
};

export type ConsequenceAnalysis = {
  checkCount: number;
  passedChecks: number;
  failedChecks: number;
  skippedChecks: number;
  passRatio: number;
  expectedSalience: number;
  realizedSalience: number;
  delta: number;
  outcome: ConsequenceOutcome;
};

export type ConsequenceMeasurementResult = {
  goalId: string;
  taskId: string;
  measuredAt: string;
  sessionKey: string;
  analysis: ConsequenceAnalysis;
  proposal: latticeUpdateProposal;
  archiveEventHash: string;
};

/**
 * Measures actual task outcomes against expected trajectory and writes
 * value-oriented consequence updates into the Soul graph.
 */
export class ConsequenceMeasurement {
  constructor(
    private readonly archive: ArchiveDB,
    private readonly graph: GraphDB,
    private readonly compiler: SoulCompiler
  ) {}

  /**
   * Measures consequence from a verification result, compiles graph updates,
   * and persists a consequence event to the Raw Archive.
   */
  public measure(input: ConsequenceMeasurementInput): ConsequenceMeasurementResult {
    if (!input.goalId.trim()) {
      throw new Error('goalId is required.');
    }

    if (!input.taskId.trim()) {
      throw new Error('taskId is required.');
    }

    const analysis = this.analyze(input.verification, input.expectedSalience);
    const proposal = this.buildProposal(input.goalId, input.taskId, analysis);
    this.compiler.compile(proposal, CONSEQUENCE_AGENT_ID);

    const measuredAt = new Date().toISOString();
    const sessionKey = input.sessionKey ?? generateSessionKey(CONSEQUENCE_AGENT_ID);
    const parentHash = this.getLatestSessionHash(sessionKey);
    const event = this.archive.appendEvent({
      parentHash,
      timestamp: measuredAt,
      sessionKey,
      eventType: 'system_event',
      agentId: CONSEQUENCE_AGENT_ID,
      channel: CONSEQUENCE_CHANNEL,
      peer: 'orchestrator',
      payload: {
        protocol: CONSEQUENCE_PROTOCOL,
        goalId: input.goalId,
        taskId: input.taskId,
        notes: input.notes ?? null,
        verification: {
          artifactId: input.verification.artifactId,
          artifactType: input.verification.artifactType,
          passed: input.verification.passed,
          archiveEventHash: input.verification.archiveEventHash,
        },
        analysis,
        proposal,
      },
    });

    return {
      goalId: input.goalId,
      taskId: input.taskId,
      measuredAt,
      sessionKey,
      analysis,
      proposal,
      archiveEventHash: event.eventHash,
    };
  }

  private analyze(
    verification: VerificationResult,
    expectedSalience?: number
  ): ConsequenceAnalysis {
    const checkCount = verification.checkResults.length;
    const passedChecks = verification.checkResults.filter((c) => c.outcome === 'passed').length;
    const failedChecks = verification.checkResults.filter((c) => c.outcome === 'failed').length;
    const skippedChecks = verification.checkResults.filter((c) => c.outcome === 'skipped').length;
    const denominator = passedChecks + failedChecks;
    const passRatio = denominator === 0 ? 1 : passedChecks / denominator;

    const expected = clamp01(expectedSalience ?? 0.7);
    const realized = clamp01(verification.passed ? Math.max(passRatio, 0.7) : passRatio);
    const delta = round(realized - expected);

    let outcome: ConsequenceOutcome;
    if (failedChecks === 0 && verification.passed) {
      outcome = 'positive';
    } else if (failedChecks === checkCount && !verification.passed) {
      outcome = 'negative';
    } else {
      outcome = 'mixed';
    }

    return {
      checkCount,
      passedChecks,
      failedChecks,
      skippedChecks,
      passRatio: round(passRatio),
      expectedSalience: expected,
      realizedSalience: realized,
      delta,
      outcome,
    };
  }

  private buildProposal(
    goalId: string,
    taskId: string,
    analysis: ConsequenceAnalysis
  ): latticeUpdateProposal {
    const candidateNodeIds = this.selectCandidateValueNodes(goalId, taskId);

    const reinforce = analysis.outcome === 'positive' ? candidateNodeIds : [];
    const contradict = analysis.outcome === 'negative' ? candidateNodeIds : [];

    const premise = `Consequence ${goalId}/${taskId}: ${analysis.outcome} outcome (${analysis.passedChecks}/${analysis.checkCount} checks passed).`;
    const proposal: latticeUpdateProposal = {
      add: [
        {
          premise,
          nodeType: 'value',
          weight: {
            salience: clamp01(Math.abs(analysis.delta) + 0.35),
            valence: analysis.outcome === 'positive' ? 0.6 : analysis.outcome === 'negative' ? -0.6 : 0,
            arousal: analysis.outcome === 'negative' ? 0.8 : analysis.outcome === 'mixed' ? 0.6 : 0.45,
            commitment: analysis.outcome === 'positive' ? 0.7 : 0.5,
            uncertainty: clamp01(1 - analysis.passRatio),
            resonance: 0.4,
          },
        },
      ],
      reinforce,
      contradict,
      edges: [],
    };

    return proposal;
  }

  private selectCandidateValueNodes(goalId: string, taskId: string): string[] {
    const query = `${goalId} ${taskId}`.trim();
    const targeted = this.graph
      .searchNodes(query)
      .filter((node) => node.nodeType === 'value')
      .map((node) => node.nodeId);

    if (targeted.length > 0) {
      return targeted.slice(0, 3);
    }

    return this.graph
      .getTopSalienceNodes(20)
      .filter((node) => node.nodeType === 'value')
      .map((node) => node.nodeId)
      .slice(0, 3);
  }

  private getLatestSessionHash(sessionKey: string): string | null {
    const events = this.archive.getEventsBySession(sessionKey);
    return events.at(-1)?.eventHash ?? null;
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
