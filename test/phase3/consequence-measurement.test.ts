/**
 * @file Unit tests for milestone 3.09 consequence measurement.
 * @author Codex GPT-5
 */

import { describe, it, expect } from 'vitest';
import { ArchiveDB } from '../../src/soul/archive-db.ts';
import { GraphDB } from '../../src/soul/graph-db.ts';
import { SoulCompiler } from '../../src/soul/compiler.ts';
import {
  ConsequenceMeasurement,
  CONSEQUENCE_CHANNEL,
  CONSEQUENCE_PROTOCOL,
} from '../../src/agents/consequence.ts';
import { VerifyBeforeCommit, buildArtifact } from '../../src/agents/verify.ts';

function setup() {
  const archive = new ArchiveDB(':memory:');
  const graph = new GraphDB(':memory:');
  const compiler = new SoulCompiler(graph);
  const consequence = new ConsequenceMeasurement(archive, graph, compiler);
  return { archive, graph, consequence };
}

function makePassingVerification(archive: ArchiveDB) {
  const verifier = new VerifyBeforeCommit(archive);
  verifier.register({
    artifactType: 'pass_case',
    checks: [{ kind: 'hash_integrity', label: 'hash ok' }],
  });

  const artifact = buildArtifact({
    artifactId: 'artifact-pass',
    producedBy: 'scraper',
    artifactType: 'pass_case',
    jobId: 'job-pass',
    content: { ok: true },
  });

  return verifier.verify(artifact);
}

function makeFailingVerification(archive: ArchiveDB) {
  const verifier = new VerifyBeforeCommit(archive);
  verifier.register({
    artifactType: 'fail_case',
    checks: [{ kind: 'content_non_empty', label: 'content required' }],
  });

  const artifact = buildArtifact({
    artifactId: 'artifact-fail',
    producedBy: 'scraper',
    artifactType: 'fail_case',
    jobId: 'job-fail',
    content: {},
  });

  return verifier.verify(artifact);
}

function makeMixedVerification(archive: ArchiveDB) {
  const verifier = new VerifyBeforeCommit(archive);
  verifier.register({
    artifactType: 'mixed_case',
    checks: [
      { kind: 'content_non_empty', label: 'non-empty' },
      { kind: 'size_within_limit', label: 'tiny', maxBytes: 8 },
    ],
  });

  const artifact = buildArtifact({
    artifactId: 'artifact-mixed',
    producedBy: 'interface',
    artifactType: 'mixed_case',
    jobId: 'job-mixed',
    content: { message: 'too large for tiny limit' },
  });

  return verifier.verify(artifact);
}

describe('Phase 3: Consequence measurement', () => {
  it('reinforces matching value nodes for positive outcomes', () => {
    const { archive, graph, consequence } = setup();
    const goalId = 'goal_focus';
    const taskId = 'task_focus';

    const nodeId = graph.createNode({
      premise: `${goalId} ${taskId} reliability and delivery consistency`,
      nodeType: 'value',
      createdBy: 'interface',
      weight: {
        salience: 0.4,
        commitment: 0.5,
        uncertainty: 0.6,
      },
    });
    const before = graph.getNode(nodeId);
    expect(before).not.toBeNull();

    const verification = makePassingVerification(archive);
    const result = consequence.measure({ goalId, taskId, verification, expectedSalience: 0.5 });
    const after = graph.getNode(nodeId);

    expect(result.analysis.outcome).toBe('positive');
    expect(result.proposal.reinforce).toContain(nodeId);
    expect(after).not.toBeNull();
    expect(after!.weight.commitment).toBeGreaterThan(before!.weight.commitment);
    expect(after!.weight.salience).toBeGreaterThan(before!.weight.salience);
    expect(after!.weight.uncertainty).toBeLessThan(before!.weight.uncertainty);
    expect(graph.getNodeCount()).toBe(2);
  });

  it('contradicts matching value nodes for negative outcomes', () => {
    const { archive, graph, consequence } = setup();
    const goalId = 'goal_break';
    const taskId = 'task_break';

    const nodeId = graph.createNode({
      premise: `${goalId} ${taskId} execution quality should remain high`,
      nodeType: 'value',
      createdBy: 'interface',
      weight: {
        salience: 0.8,
        commitment: 0.8,
        uncertainty: 0.2,
      },
    });
    const before = graph.getNode(nodeId);
    expect(before).not.toBeNull();

    const verification = makeFailingVerification(archive);
    const result = consequence.measure({ goalId, taskId, verification });
    const after = graph.getNode(nodeId);

    expect(result.analysis.outcome).toBe('negative');
    expect(result.proposal.contradict).toContain(nodeId);
    expect(after).not.toBeNull();
    expect(after!.weight.commitment).toBeLessThan(before!.weight.commitment);
    expect(after!.weight.salience).toBeLessThan(before!.weight.salience);
    expect(after!.weight.uncertainty).toBeGreaterThan(before!.weight.uncertainty);
  });

  it('persists consequence records to the archive with protocol envelope', () => {
    const { archive, consequence } = setup();
    const verification = makePassingVerification(archive);

    const result = consequence.measure({
      goalId: 'goal_archive',
      taskId: 'task_archive',
      verification,
      notes: 'Post-task outcome logged.',
    });

    const event = archive.getEventByHash(result.archiveEventHash);
    expect(event).not.toBeNull();
    expect(event?.eventType).toBe('system_event');
    expect(event?.channel).toBe(CONSEQUENCE_CHANNEL);

    const payload = event?.payload as Record<string, unknown>;
    expect(payload.protocol).toBe(CONSEQUENCE_PROTOCOL);
    expect(payload.goalId).toBe('goal_archive');
    expect(payload.taskId).toBe('task_archive');
    expect(payload.notes).toBe('Post-task outcome logged.');

    const verificationPayload = payload.verification as Record<string, unknown>;
    expect(verificationPayload.archiveEventHash).toBe(verification.archiveEventHash);
  });

  it('returns mixed outcome when checks are partially successful', () => {
    const { archive, consequence } = setup();
    const verification = makeMixedVerification(archive);

    const result = consequence.measure({
      goalId: 'goal_mixed',
      taskId: 'task_mixed',
      verification,
    });

    expect(result.analysis.outcome).toBe('mixed');
    expect(result.proposal.reinforce).toHaveLength(0);
    expect(result.proposal.contradict).toHaveLength(0);
    expect(result.analysis.failedChecks).toBeGreaterThan(0);
    expect(result.analysis.passedChecks).toBeGreaterThan(0);
  });
});
