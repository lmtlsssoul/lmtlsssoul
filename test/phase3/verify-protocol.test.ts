/**
 * @file test/phase3/verify-protocol.test.ts
 * @description Unit tests for milestone 3.08: verify-before-commit protocol.
 */

import { describe, it, expect } from 'vitest';

import {
  VerifyBeforeCommit,
  VerifyError,
  buildArtifact,
  computeContentHash,
  VERIFY_CHANNEL,
  VERIFY_PROTOCOL,
} from '../../src/agents/verify.ts';
import { ArchiveDB } from '../../src/soul/archive-db.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArchive(): ArchiveDB {
  return new ArchiveDB(':memory:');
}

function makeVerifier(archive?: ArchiveDB): VerifyBeforeCommit {
  return new VerifyBeforeCommit(archive ?? makeArchive());
}

// ---------------------------------------------------------------------------
// computeContentHash
// ---------------------------------------------------------------------------

describe('computeContentHash', () => {
  it('produces a 64-character hex string', () => {
    const hash = computeContentHash({ foo: 'bar' });
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('is deterministic for identical inputs', () => {
    const a = computeContentHash([1, 2, 3]);
    const b = computeContentHash([1, 2, 3]);
    expect(a).toBe(b);
  });

  it('differs for different inputs', () => {
    const a = computeContentHash({ value: 'alpha' });
    const b = computeContentHash({ value: 'beta' });
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// buildArtifact
// ---------------------------------------------------------------------------

describe('buildArtifact', () => {
  it('populates all required fields', () => {
    const artifact = buildArtifact({
      artifactId: 'art-001',
      producedBy: 'scraper',
      artifactType: 'scrape_result',
      jobId: 'job-001',
      content: { url: 'https://example.com', text: 'Hello world' },
    });

    expect(artifact.artifactId).toBe('art-001');
    expect(artifact.producedBy).toBe('scraper');
    expect(artifact.artifactType).toBe('scrape_result');
    expect(artifact.jobId).toBe('job-001');
    expect(artifact.contentHash).toHaveLength(64);
    expect(artifact.sessionKey.startsWith('lmtlss:scraper:')).toBe(true);
    expect(artifact.metadata).toEqual({});
    expect(artifact.createdAt).toBeTruthy();
  });

  it('uses provided sessionKey when given', () => {
    const artifact = buildArtifact({
      artifactId: 'art-002',
      producedBy: 'reflection',
      artifactType: 'reflection_probe',
      jobId: 'job-002',
      content: { findings: [] },
      sessionKey: 'lmtlss:reflection:01HXYZ',
    });

    expect(artifact.sessionKey).toBe('lmtlss:reflection:01HXYZ');
  });

  it('computes contentHash that matches computeContentHash', () => {
    const content = { key: 'value', list: [1, 2, 3] };
    const artifact = buildArtifact({
      artifactId: 'art-003',
      producedBy: 'orchestrator',
      artifactType: 'goal_output',
      jobId: 'job-003',
      content,
    });

    expect(artifact.contentHash).toBe(computeContentHash(content));
  });
});

// ---------------------------------------------------------------------------
// VerifyBeforeCommit.register
// ---------------------------------------------------------------------------

describe('VerifyBeforeCommit.register', () => {
  it('registers a verification set successfully', () => {
    const verifier = makeVerifier();
    verifier.register({
      artifactType: 'scrape_result',
      checks: [{ kind: 'hash_integrity', label: 'Hash check' }],
    });
    expect(verifier.getSet('scrape_result')).not.toBeNull();
  });

  it('throws VerifyError for blank artifactType', () => {
    const verifier = makeVerifier();
    expect(() =>
      verifier.register({ artifactType: '  ', checks: [{ kind: 'content_non_empty', label: 'x' }] })
    ).toThrow(VerifyError);
  });

  it('throws VerifyError for empty checks array', () => {
    const verifier = makeVerifier();
    expect(() =>
      verifier.register({ artifactType: 'my_type', checks: [] })
    ).toThrow(VerifyError);
  });

  it('replaces existing registration for same artifactType', () => {
    const verifier = makeVerifier();
    verifier.register({
      artifactType: 'my_type',
      checks: [{ kind: 'hash_integrity', label: 'First' }],
    });
    verifier.register({
      artifactType: 'my_type',
      checks: [{ kind: 'content_non_empty', label: 'Second' }],
    });
    const set = verifier.getSet('my_type');
    expect(set?.checks[0].label).toBe('Second');
  });
});

// ---------------------------------------------------------------------------
// VerifyBeforeCommit.verify — happy path
// ---------------------------------------------------------------------------

describe('VerifyBeforeCommit.verify — passed', () => {
  it('passes hash_integrity for a correctly built artifact', () => {
    const archive = makeArchive();
    const verifier = makeVerifier(archive);

    verifier.register({
      artifactType: 'scrape_result',
      checks: [{ kind: 'hash_integrity', label: 'Hash check' }],
    });

    const artifact = buildArtifact({
      artifactId: 'art-100',
      producedBy: 'scraper',
      artifactType: 'scrape_result',
      jobId: 'job-100',
      content: { url: 'https://example.com', data: 'lorem ipsum' },
    });

    const result = verifier.verify(artifact);

    expect(result.passed).toBe(true);
    expect(result.checkResults[0].outcome).toBe('passed');
    expect(result.archiveEventHash).toHaveLength(64);
  });

  it('passes content_non_empty for a populated payload', () => {
    const verifier = makeVerifier();

    verifier.register({
      artifactType: 'reflection_probe',
      checks: [{ kind: 'content_non_empty', label: 'Non-empty' }],
    });

    const artifact = buildArtifact({
      artifactId: 'art-101',
      producedBy: 'reflection',
      artifactType: 'reflection_probe',
      jobId: 'job-101',
      content: { findings: ['node-a contradicts node-b'] },
    });

    const result = verifier.verify(artifact);
    expect(result.passed).toBe(true);
  });

  it('passes size_within_limit for small content', () => {
    const verifier = makeVerifier();

    verifier.register({
      artifactType: 'goal_output',
      checks: [{ kind: 'size_within_limit', label: 'Size check', maxBytes: 10_000 }],
    });

    const artifact = buildArtifact({
      artifactId: 'art-102',
      producedBy: 'orchestrator',
      artifactType: 'goal_output',
      jobId: 'job-102',
      content: { status: 'complete', tasks: 5 },
    });

    const result = verifier.verify(artifact);
    expect(result.passed).toBe(true);
    expect(result.checkResults[0].outcome).toBe('passed');
  });

  it('passes schema_valid when predicate returns true', () => {
    const verifier = makeVerifier();

    verifier.register({
      artifactType: 'structured_data',
      checks: [
        {
          kind: 'schema_valid',
          label: 'Has required fields',
          predicate: (artifact) => {
            const c = artifact.content as Record<string, unknown>;
            return typeof c.title === 'string' && typeof c.body === 'string';
          },
        },
      ],
    });

    const artifact = buildArtifact({
      artifactId: 'art-103',
      producedBy: 'interface',
      artifactType: 'structured_data',
      jobId: 'job-103',
      content: { title: 'Hello', body: 'World' },
    });

    const result = verifier.verify(artifact);
    expect(result.passed).toBe(true);
  });

  it('passes custom_predicate when predicate returns true', () => {
    const verifier = makeVerifier();

    verifier.register({
      artifactType: 'custom_output',
      checks: [
        {
          kind: 'custom_predicate',
          label: 'Has non-zero score',
          predicate: (artifact) => {
            const c = artifact.content as { score: number };
            return c.score > 0;
          },
        },
      ],
    });

    const artifact = buildArtifact({
      artifactId: 'art-104',
      producedBy: 'compiler',
      artifactType: 'custom_output',
      jobId: 'job-104',
      content: { score: 42 },
    });

    const result = verifier.verify(artifact);
    expect(result.passed).toBe(true);
  });

  it('skips schema_valid check when no predicate is provided', () => {
    const verifier = makeVerifier();

    verifier.register({
      artifactType: 'permissive_type',
      checks: [{ kind: 'schema_valid', label: 'Schema (no predicate)' }],
    });

    const artifact = buildArtifact({
      artifactId: 'art-105',
      producedBy: 'scraper',
      artifactType: 'permissive_type',
      jobId: 'job-105',
      content: { anything: true },
    });

    const result = verifier.verify(artifact);
    expect(result.checkResults[0].outcome).toBe('skipped');
    // Skipped checks don't count as failures
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// VerifyBeforeCommit.verify — failure cases
// ---------------------------------------------------------------------------

describe('VerifyBeforeCommit.verify — failed', () => {
  it('fails hash_integrity when contentHash is tampered', () => {
    const verifier = makeVerifier();

    verifier.register({
      artifactType: 'tampered',
      checks: [{ kind: 'hash_integrity', label: 'Hash must match' }],
    });

    const artifact = buildArtifact({
      artifactId: 'art-200',
      producedBy: 'scraper',
      artifactType: 'tampered',
      jobId: 'job-200',
      content: { data: 'original' },
    });

    // Tamper the hash
    const tampered: TaskArtifact = { ...artifact, contentHash: 'a'.repeat(64) };

    const result = verifier.verify(tampered);
    expect(result.passed).toBe(false);
    expect(result.checkResults[0].outcome).toBe('failed');
  });

  it('fails content_non_empty for null content', () => {
    const verifier = makeVerifier();

    verifier.register({
      artifactType: 'nullable_type',
      checks: [{ kind: 'content_non_empty', label: 'Must not be null' }],
    });

    const artifact = buildArtifact({
      artifactId: 'art-201',
      producedBy: 'reflection',
      artifactType: 'nullable_type',
      jobId: 'job-201',
      content: null,
    });

    const result = verifier.verify(artifact);
    expect(result.passed).toBe(false);
  });

  it('fails content_non_empty for empty object', () => {
    const verifier = makeVerifier();

    verifier.register({
      artifactType: 'empty_obj_type',
      checks: [{ kind: 'content_non_empty', label: 'Must have fields' }],
    });

    const artifact = buildArtifact({
      artifactId: 'art-202',
      producedBy: 'orchestrator',
      artifactType: 'empty_obj_type',
      jobId: 'job-202',
      content: {},
    });

    const result = verifier.verify(artifact);
    expect(result.passed).toBe(false);
  });

  it('fails size_within_limit for oversized content', () => {
    const verifier = makeVerifier();

    verifier.register({
      artifactType: 'tiny_type',
      checks: [{ kind: 'size_within_limit', label: 'Max 10 bytes', maxBytes: 10 }],
    });

    const artifact = buildArtifact({
      artifactId: 'art-203',
      producedBy: 'scraper',
      artifactType: 'tiny_type',
      jobId: 'job-203',
      content: { body: 'This string is definitely more than ten bytes.' },
    });

    const result = verifier.verify(artifact);
    expect(result.passed).toBe(false);
    expect(result.checkResults[0].outcome).toBe('failed');
  });

  it('fails when any one check in a multi-check set fails', () => {
    const verifier = makeVerifier();

    verifier.register({
      artifactType: 'multi_check',
      checks: [
        { kind: 'hash_integrity', label: 'Hash check' },
        { kind: 'content_non_empty', label: 'Non-empty check' },
        { kind: 'size_within_limit', label: 'Max 5 bytes', maxBytes: 5 },
      ],
    });

    const artifact = buildArtifact({
      artifactId: 'art-204',
      producedBy: 'interface',
      artifactType: 'multi_check',
      jobId: 'job-204',
      content: { data: 'This content is too large for 5 bytes.' },
    });

    const result = verifier.verify(artifact);
    expect(result.passed).toBe(false);
    // First two checks pass, third fails
    expect(result.checkResults[0].outcome).toBe('passed');
    expect(result.checkResults[1].outcome).toBe('passed');
    expect(result.checkResults[2].outcome).toBe('failed');
  });

  it('throws VerifyError when no verification set is registered for the artifact type', () => {
    const verifier = makeVerifier();

    const artifact = buildArtifact({
      artifactId: 'art-205',
      producedBy: 'scraper',
      artifactType: 'unregistered_type',
      jobId: 'job-205',
      content: { x: 1 },
    });

    expect(() => verifier.verify(artifact)).toThrow(VerifyError);
  });
});

// ---------------------------------------------------------------------------
// Archive persistence
// ---------------------------------------------------------------------------

describe('VerifyBeforeCommit — archive persistence', () => {
  it('persists the verification result to the Raw Archive', () => {
    const archive = makeArchive();
    const verifier = makeVerifier(archive);

    verifier.register({
      artifactType: 'archivable',
      checks: [{ kind: 'hash_integrity', label: 'Hash check' }],
    });

    const artifact = buildArtifact({
      artifactId: 'art-300',
      producedBy: 'reflection',
      artifactType: 'archivable',
      jobId: 'job-300',
      content: { insight: 'Patterns detected across 48h window.' },
    });

    const result = verifier.verify(artifact);

    // The archive event must exist
    const event = archive.getEventByHash(result.archiveEventHash);
    expect(event).not.toBeNull();
    expect(event?.channel).toBe(VERIFY_CHANNEL);
    expect(event?.eventType).toBe('system_event');

    const payload = event?.payload as Record<string, unknown>;
    expect(payload.protocol).toBe(VERIFY_PROTOCOL);
    expect(payload.artifactId).toBe('art-300');
    expect(payload.passed).toBe(true);
  });

  it('persists both passed and failed results to the archive', () => {
    const archive = makeArchive();
    const verifier = makeVerifier(archive);

    verifier.register({
      artifactType: 'strict_type',
      checks: [{ kind: 'content_non_empty', label: 'Non-empty' }],
    });

    const failArtifact = buildArtifact({
      artifactId: 'art-301',
      producedBy: 'compiler',
      artifactType: 'strict_type',
      jobId: 'job-301',
      content: {},
    });

    const failResult = verifier.verify(failArtifact);
    expect(failResult.passed).toBe(false);

    const failEvent = archive.getEventByHash(failResult.archiveEventHash);
    expect(failEvent).not.toBeNull();

    const failPayload = failEvent?.payload as Record<string, unknown>;
    expect(failPayload.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Type alias export for test usage
// ---------------------------------------------------------------------------

import type { TaskArtifact } from '../../src/agents/verify.ts';
