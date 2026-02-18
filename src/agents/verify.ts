/**
 * @file src/agents/verify.ts
 * @description Verify-before-commit protocol for task artifacts and verification sets.
 *
 * Every task artifact produced by an agent must pass its registered verification
 * set before being committed to the Raw Archive. This enforces deterministic
 * verification (System Invariant #4) and prevents unvalidated outputs from
 * polluting the Soul Index or Raw Archive.
 *
 * Protocol:
 *   1. Agent produces a TaskArtifact via buildArtifact().
 *   2. Caller invokes VerifyBeforeCommit.verify(artifact).
 *   3. All registered checks run in order.
 *   4. The VerificationResult is persisted to the Raw Archive.
 *   5. Caller inspects result.passed before committing the artifact payload.
 */

import crypto from 'node:crypto';

import { ArchiveDB } from '../soul/archive-db.ts';
import { generateSessionKey } from '../soul/session-key.ts';
import type { HydratedArchiveEvent } from '../soul/archive-db.ts';
import type { AgentRole } from './types.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Raw Archive channel name for verification events. */
export const VERIFY_CHANNEL = 'verify';

/** Payload protocol tag for verification events. */
export const VERIFY_PROTOCOL = 'verify.v1';

/** The agent role that writes verification events. Compiler owns verification. */
const VERIFIER_AGENT_ID: AgentRole = 'compiler';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Logical category name for an artifact (e.g. "scrape_result", "reflection_probe"). */
export type ArtifactType = string;

/** The kinds of checks that can be run against an artifact. */
export type CheckKind =
  | 'hash_integrity'
  | 'content_non_empty'
  | 'size_within_limit'
  | 'schema_valid'
  | 'custom_predicate';

/** Outcome of a single check. */
export type CheckOutcome = 'passed' | 'failed' | 'skipped';

/**
 * Configuration for a single verification check.
 * Each check targets a specific dimension of artifact quality.
 */
export type VerificationCheck = {
  /** The kind of check to run. */
  kind: CheckKind;
  /** Human-readable label displayed in results. */
  label: string;
  /**
   * Maximum content size in bytes.
   * Only used by the `size_within_limit` check.
   * Defaults to 1 MiB if omitted.
   */
  maxBytes?: number;
  /**
   * A deterministic predicate over the artifact.
   * Used by `schema_valid` and `custom_predicate` checks.
   * Must return true for the check to pass.
   */
  predicate?: (artifact: TaskArtifact) => boolean;
};

/**
 * A named collection of verification checks for a specific artifact type.
 * Register one verification set per artifact type via VerifyBeforeCommit.register().
 */
export type VerificationSet = {
  /** Must match the artifactType field on TaskArtifact. */
  artifactType: ArtifactType;
  /** One or more checks to run in order. Must not be empty. */
  checks: VerificationCheck[];
};

/**
 * A structured output produced by an agent completing a task.
 * Built via buildArtifact() to ensure the contentHash is computed correctly.
 */
export type TaskArtifact = {
  /** Unique artifact ID (ULID recommended). */
  artifactId: string;
  /** The agent role that produced this artifact. */
  producedBy: AgentRole;
  /** Logical type matching a registered VerificationSet. */
  artifactType: ArtifactType;
  /** Source job ID from the queue runner. */
  jobId: string;
  /** ISO 8601 timestamp of artifact creation. */
  createdAt: string;
  /** Session key scoped to the producing agent's session. */
  sessionKey: string;
  /** The actual content payload. Must be JSON-serializable. */
  content: unknown;
  /** SHA-256 hex digest of JSON.stringify(content). */
  contentHash: string;
  /** Arbitrary key-value metadata. */
  metadata: Record<string, unknown>;
};

/**
 * Result of running a single verification check.
 */
export type CheckResult = {
  kind: CheckKind;
  label: string;
  outcome: CheckOutcome;
  /** Human-readable explanation of the check outcome. */
  message: string;
};

/**
 * Aggregate result of running all checks in a verification set.
 * Persisted to the Raw Archive before being returned.
 */
export type VerificationResult = {
  artifactId: string;
  artifactType: ArtifactType;
  /** True only if every check passed (none failed). Skipped checks do not count as failures. */
  passed: boolean;
  checkResults: CheckResult[];
  /** ISO 8601 timestamp when verification ran. */
  verifiedAt: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Event hash of the archive record that captured this result. */
  archiveEventHash: string;
};

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Typed error class for verification failures and configuration errors.
 */
export class VerifyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VerifyError';
  }
}

// ---------------------------------------------------------------------------
// Artifact builder helpers
// ---------------------------------------------------------------------------

/**
 * Computes the SHA-256 content hash for a task artifact payload.
 * The hash covers JSON.stringify(content).
 */
export function computeContentHash(content: unknown): string {
  const serialized = JSON.stringify(content);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Constructs a TaskArtifact with a correctly computed contentHash.
 * Always use this factory instead of constructing TaskArtifact directly.
 */
export function buildArtifact(params: {
  artifactId: string;
  producedBy: AgentRole;
  artifactType: ArtifactType;
  jobId: string;
  content: unknown;
  metadata?: Record<string, unknown>;
  sessionKey?: string;
}): TaskArtifact {
  const createdAt = new Date().toISOString();
  const sessionKey = params.sessionKey ?? generateSessionKey(params.producedBy);
  const contentHash = computeContentHash(params.content);

  return {
    artifactId: params.artifactId,
    producedBy: params.producedBy,
    artifactType: params.artifactType,
    jobId: params.jobId,
    createdAt,
    sessionKey,
    content: params.content,
    contentHash,
    metadata: params.metadata ?? {},
  };
}

// ---------------------------------------------------------------------------
// Verify-before-commit protocol
// ---------------------------------------------------------------------------

/**
 * Enforces the verify-before-commit protocol.
 *
 * Task artifacts must pass all checks in their registered VerificationSet before
 * the caller commits them to the Raw Archive. Verification results are themselves
 * persisted to the Raw Archive for full audit trail coverage.
 *
 * @example
 * ```ts
 * const verifier = new VerifyBeforeCommit(archive);
 *
 * verifier.register({
 *   artifactType: 'scrape_result',
 *   checks: [
 *     { kind: 'hash_integrity', label: 'Content hash matches' },
 *     { kind: 'content_non_empty', label: 'Result is non-empty' },
 *     { kind: 'size_within_limit', label: 'Size under 512 KiB', maxBytes: 524_288 },
 *   ],
 * });
 *
 * const artifact = buildArtifact({ ... });
 * const result = verifier.verify(artifact);
 *
 * if (result.passed) {
 *   // safe to commit artifact to archive
 * }
 * ```
 */
export class VerifyBeforeCommit {
  private readonly sets: Map<ArtifactType, VerificationSet> = new Map();

  constructor(private readonly archive: ArchiveDB) {}

  /**
   * Registers a verification set for an artifact type.
   * Replaces any existing registration for the same artifact type.
   *
   * @throws VerifyError if artifactType is blank or checks array is empty.
   */
  public register(set: VerificationSet): void {
    if (!set.artifactType.trim()) {
      throw new VerifyError(
        'artifactType must not be empty.',
        'INVALID_ARTIFACT_TYPE'
      );
    }

    if (set.checks.length === 0) {
      throw new VerifyError(
        `Verification set for "${set.artifactType}" must contain at least one check.`,
        'EMPTY_CHECK_SET',
        { artifactType: set.artifactType }
      );
    }

    this.sets.set(set.artifactType, set);
  }

  /**
   * Returns the registered VerificationSet for an artifact type, or null if none.
   */
  public getSet(artifactType: ArtifactType): VerificationSet | null {
    return this.sets.get(artifactType) ?? null;
  }

  /**
   * Runs the registered verification set against the artifact.
   * Persists the result to the Raw Archive and returns it.
   *
   * @throws VerifyError if no verification set is registered for the artifact type.
   */
  public verify(artifact: TaskArtifact): VerificationResult {
    const set = this.sets.get(artifact.artifactType);
    if (!set) {
      throw new VerifyError(
        `No verification set registered for artifact type "${artifact.artifactType}".`,
        'NO_VERIFICATION_SET',
        { artifactType: artifact.artifactType }
      );
    }

    const startMs = Date.now();
    const checkResults = set.checks.map((check) => this.runCheck(check, artifact));
    const durationMs = Date.now() - startMs;
    const verifiedAt = new Date().toISOString();
    const passed = checkResults.every((r) => r.outcome !== 'failed');

    const archiveEvent = this.persistResult(artifact, {
      passed,
      checkResults,
      verifiedAt,
      durationMs,
    });

    return {
      artifactId: artifact.artifactId,
      artifactType: artifact.artifactType,
      passed,
      checkResults,
      verifiedAt,
      durationMs,
      archiveEventHash: archiveEvent.eventHash,
    };
  }

  // -------------------------------------------------------------------------
  // Private: check runners
  // -------------------------------------------------------------------------

  private runCheck(check: VerificationCheck, artifact: TaskArtifact): CheckResult {
    try {
      switch (check.kind) {
        case 'hash_integrity':
          return this.checkHashIntegrity(check, artifact);

        case 'content_non_empty':
          return this.checkContentNonEmpty(check, artifact);

        case 'size_within_limit':
          return this.checkSizeWithinLimit(check, artifact);

        case 'schema_valid':
          return this.checkSchemaValid(check, artifact);

        case 'custom_predicate':
          return this.checkCustomPredicate(check, artifact);

        default: {
          const _exhaustive: never = check.kind;
          return {
            kind: check.kind,
            label: check.label,
            outcome: 'skipped',
            message: `Unknown check kind: ${String(_exhaustive)}`,
          };
        }
      }
    } catch (err) {
      return {
        kind: check.kind,
        label: check.label,
        outcome: 'failed',
        message: `Check threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Recomputes the SHA-256 hash of the artifact content and compares it to
   * the stored contentHash. Detects accidental or malicious mutation.
   */
  private checkHashIntegrity(check: VerificationCheck, artifact: TaskArtifact): CheckResult {
    const recomputed = computeContentHash(artifact.content);
    const ok = recomputed === artifact.contentHash;
    return {
      kind: 'hash_integrity',
      label: check.label,
      outcome: ok ? 'passed' : 'failed',
      message: ok
        ? `Content hash verified: ${artifact.contentHash.slice(0, 16)}…`
        : `Hash mismatch. Stored: ${artifact.contentHash.slice(0, 16)}… Computed: ${recomputed.slice(0, 16)}…`,
    };
  }

  /**
   * Fails if the artifact content is null, an empty string, an empty array,
   * or an empty object. Numeric zero and boolean false are not considered empty.
   */
  private checkContentNonEmpty(check: VerificationCheck, artifact: TaskArtifact): CheckResult {
    const content = artifact.content;
    const serialized = JSON.stringify(content);
    const empty =
      serialized === 'null' ||
      serialized === '{}' ||
      serialized === '[]' ||
      serialized === '""' ||
      serialized === undefined;

    return {
      kind: 'content_non_empty',
      label: check.label,
      outcome: empty ? 'failed' : 'passed',
      message: empty ? 'Artifact content is empty or null.' : 'Artifact content is non-empty.',
    };
  }

  /**
   * Fails if JSON.stringify(content) exceeds maxBytes (default 1 MiB).
   */
  private checkSizeWithinLimit(check: VerificationCheck, artifact: TaskArtifact): CheckResult {
    const maxBytes = check.maxBytes ?? 1_048_576;
    const serialized = JSON.stringify(artifact.content);
    const bytes = Buffer.byteLength(serialized, 'utf8');
    const ok = bytes <= maxBytes;
    return {
      kind: 'size_within_limit',
      label: check.label,
      outcome: ok ? 'passed' : 'failed',
      message: ok
        ? `Content size ${bytes} B is within limit of ${maxBytes} B.`
        : `Content size ${bytes} B exceeds limit of ${maxBytes} B.`,
    };
  }

  /**
   * Runs a predicate as a schema validity check.
   * Skipped if no predicate is provided.
   */
  private checkSchemaValid(check: VerificationCheck, artifact: TaskArtifact): CheckResult {
    if (!check.predicate) {
      return {
        kind: 'schema_valid',
        label: check.label,
        outcome: 'skipped',
        message: 'No schema predicate provided; check skipped.',
      };
    }

    const ok = check.predicate(artifact);
    return {
      kind: 'schema_valid',
      label: check.label,
      outcome: ok ? 'passed' : 'failed',
      message: ok ? 'Schema validation passed.' : 'Schema validation failed.',
    };
  }

  /**
   * Runs an arbitrary deterministic predicate.
   * Skipped if no predicate is provided.
   */
  private checkCustomPredicate(check: VerificationCheck, artifact: TaskArtifact): CheckResult {
    if (!check.predicate) {
      return {
        kind: 'custom_predicate',
        label: check.label,
        outcome: 'skipped',
        message: 'No predicate function provided; check skipped.',
      };
    }

    const ok = check.predicate(artifact);
    return {
      kind: 'custom_predicate',
      label: check.label,
      outcome: ok ? 'passed' : 'failed',
      message: ok
        ? `Custom check "${check.label}" passed.`
        : `Custom check "${check.label}" failed.`,
    };
  }

  // -------------------------------------------------------------------------
  // Private: archive persistence
  // -------------------------------------------------------------------------

  /**
   * Persists a verification result as a `system_event` to the Raw Archive.
   * Returns the resulting archive event (which carries the event hash).
   */
  private persistResult(
    artifact: TaskArtifact,
    result: {
      passed: boolean;
      checkResults: CheckResult[];
      verifiedAt: string;
      durationMs: number;
    }
  ): HydratedArchiveEvent {
    const timestamp = new Date().toISOString();

    return this.archive.appendEvent({
      parentHash: null,
      timestamp,
      sessionKey: artifact.sessionKey,
      eventType: 'system_event',
      agentId: VERIFIER_AGENT_ID,
      channel: VERIFY_CHANNEL,
      peer: artifact.producedBy,
      payload: {
        protocol: VERIFY_PROTOCOL,
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        jobId: artifact.jobId,
        passed: result.passed,
        checkResults: result.checkResults,
        verifiedAt: result.verifiedAt,
        durationMs: result.durationMs,
      },
    });
  }
}
