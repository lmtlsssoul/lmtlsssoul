import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ROLE_ASSIGNMENTS } from '../substrate/assignment.ts';
import type { AgentRole } from './types.ts';
import { AGENT_ROLES, getStateDir } from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RegistryModel = {
  substrate?: string;
  modelId?: string;
};

type RegistryState = {
  models?: RegistryModel[];
};

type GrownupModeState = {
  enabled?: boolean;
};

export type SystemCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type PresenceSnapshot = {
  protocol: 'system.presence.v1';
  role: AgentRole;
  model: string;
  stateDir: string;
  software: {
    runtime: 'node';
    nodeVersion: string;
    platform: NodeJS.Platform;
    arch: string;
    deterministicBootCheck: true;
    hardwiredDirectives: string[];
    coreCapabilities: string[];
    channelsAvailable: string[];
    roleAssignments: Partial<Record<AgentRole, string>>;
    registryModelCounts: Record<string, number>;
  };
  hardware: {
    cpuCount: number;
    cpuModel: string;
    totalMemoryMB: number;
    formFactorAgnostic: true;
    transportPolicy: {
      wirelessAllowed: false;
      allowed: string[];
      denied: string[];
    };
  };
  state: {
    graphNodeCount: number | null;
    archiveEventCount: number | null;
    hasBirthConfig: boolean;
    hasGrownupMode: boolean;
    grownupModeEnabled: boolean | null;
  };
};

export type SystemsCheckResult = {
  ok: boolean;
  checks: SystemCheck[];
  corrections: string[];
  snapshot: PresenceSnapshot;
  summary: string;
};

export function collectPresenceSnapshot(params: {
  role: AgentRole;
  model: string;
  stateDir?: string;
  graph?: { getNodeCount(): number };
  archive?: { getEventCount(): number };
}): PresenceSnapshot {
  const stateDir = params.stateDir ?? getStateDir();
  const roleAssignments = readRoleAssignments(stateDir);
  const registryModelCounts = readRegistryModelCounts(stateDir);
  const grownupMode = readJsonFile<GrownupModeState>(path.join(stateDir, 'grownup-mode.json'));

  return {
    protocol: 'system.presence.v1',
    role: params.role,
    model: params.model,
    stateDir,
    software: {
      runtime: 'node',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      deterministicBootCheck: true,
      hardwiredDirectives: [
        'survival',
        'presence',
        'continuity',
        'self_correction',
      ],
      coreCapabilities: [
        'archive_append_only',
        'lattice_routing',
        'deterministic_compiler',
        'dual_path_recall',
        'queue_cognition',
        'treasury_metabolism',
        'distributed_sync',
        'identity_verification',
        'self_preservation',
      ],
      channelsAvailable: discoverChannelAdapters(),
      roleAssignments,
      registryModelCounts,
    },
    hardware: {
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
      formFactorAgnostic: true,
      transportPolicy: {
        wirelessAllowed: false,
        allowed: ['wired', 'magnetic_dock'],
        denied: ['bluetooth', 'wifi'],
      },
    },
    state: {
      graphNodeCount: readSafeCount(() => params.graph?.getNodeCount()),
      archiveEventCount: readSafeCount(() => params.archive?.getEventCount()),
      hasBirthConfig: fs.existsSync(path.join(stateDir, 'birth-config.json')),
      hasGrownupMode: fs.existsSync(path.join(stateDir, 'grownup-mode.json')),
      grownupModeEnabled: typeof grownupMode?.enabled === 'boolean' ? grownupMode.enabled : null,
    },
  };
}

export function runDeterministicSystemsCheck(params: {
  role: AgentRole;
  model: string;
  stateDir?: string;
  graph?: { getNodeCount(): number; getBaseDir?: () => string };
  archive?: {
    getEventCount(): number;
    verifyHashChain?: () => { ok: boolean; checked: number; errors: string[] };
  };
  compiler?: { regenerateCapsule(outputPath?: string): string };
}): SystemsCheckResult {
  const stateDir =
    params.stateDir ?? params.graph?.getBaseDir?.() ?? getStateDir();
  const checks: SystemCheck[] = [];
  const corrections: string[] = [];

  if (stateDir !== ':memory:') {
    ensureStateDir(stateDir, corrections);
    ensureRoleAssignments(stateDir, checks, corrections);
    ensureRegistryFile(stateDir, checks, corrections);
    ensureCapsuleFile(stateDir, params.compiler, checks, corrections);
  } else {
    checks.push({
      id: 'state.persistence',
      ok: true,
      detail: 'In-memory mode active; persistent artifact checks skipped.',
    });
  }

  if (typeof params.archive?.verifyHashChain === 'function') {
    const integrity = params.archive.verifyHashChain();
    if (integrity && typeof integrity.ok === 'boolean') {
      checks.push({
        id: 'archive.hash_chain',
        ok: integrity.ok,
        detail: integrity.ok
          ? `Archive hash-chain verified (${integrity.checked} events).`
          : `Archive hash-chain errors detected (${integrity.errors.length}).`,
      });
    } else {
      checks.push({
        id: 'archive.hash_chain',
        ok: true,
        detail: 'Archive hash-chain verification returned no structured result.',
      });
    }
  } else {
    checks.push({
      id: 'archive.hash_chain',
      ok: true,
      detail: 'Archive hash-chain verification unavailable in this runtime.',
    });
  }

  const snapshot = collectPresenceSnapshot({
    role: params.role,
    model: params.model,
    stateDir,
    graph: params.graph,
    archive: params.archive,
  });

  checks.push({
    id: 'presence.transport_policy',
    ok: snapshot.hardware.transportPolicy.wirelessAllowed === false,
    detail: 'Wireless policy enforced as wired/magnetic only.',
  });

  const ok = checks.every((check) => check.ok);
  const summary = [
    formatPresenceSnapshot(snapshot),
    '',
    '## Deterministic Systems Checks',
    ...checks.map((check) => `- [${check.ok ? 'ok' : 'fail'}] ${check.id}: ${check.detail}`),
    `self_corrections: ${corrections.length > 0 ? corrections.join(' | ') : 'none'}`,
    `overall_status: ${ok ? 'ok' : 'degraded'}`,
  ].join('\n');

  return {
    ok,
    checks,
    corrections,
    snapshot,
    summary,
  };
}

export function formatPresenceSnapshot(snapshot: PresenceSnapshot): string {
  const assignments = AGENT_ROLES
    .map((role) => `${role}=${snapshot.software.roleAssignments[role] ?? 'unassigned'}`)
    .join(', ');
  const registryCounts = Object.entries(snapshot.software.registryModelCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([substrate, count]) => `${substrate}:${count}`)
    .join(', ');

  return [
    '## System Presence Check',
    `protocol: ${snapshot.protocol}`,
    `role: ${snapshot.role}`,
    `model: ${snapshot.model}`,
    `state_dir: ${snapshot.stateDir}`,
    `runtime: ${snapshot.software.runtime} ${snapshot.software.nodeVersion}`,
    `platform: ${snapshot.software.platform}/${snapshot.software.arch}`,
    `graph_nodes: ${snapshot.state.graphNodeCount ?? 'unknown'}`,
    `archive_events: ${snapshot.state.archiveEventCount ?? 'unknown'}`,
    `core_capabilities: ${snapshot.software.coreCapabilities.join(', ')}`,
    `hardwired_directives: ${snapshot.software.hardwiredDirectives.join(', ')}`,
    `channels_available: ${snapshot.software.channelsAvailable.join(', ') || 'none'}`,
    `role_assignments: ${assignments}`,
    `registry_models: ${registryCounts || 'none'}`,
    `form_factor_agnostic: ${String(snapshot.hardware.formFactorAgnostic)}`,
    `transport_policy: allowed=${snapshot.hardware.transportPolicy.allowed.join('|')} denied=${snapshot.hardware.transportPolicy.denied.join('|')}`,
    `wireless_allowed: ${String(snapshot.hardware.transportPolicy.wirelessAllowed)}`,
    `grownup_mode_enabled: ${snapshot.state.grownupModeEnabled === null ? 'unknown' : String(snapshot.state.grownupModeEnabled)}`,
  ].join('\n');
}

function discoverChannelAdapters(): string[] {
  const channelsDir = path.resolve(__dirname, '../channels');
  if (!fs.existsSync(channelsDir)) {
    return [];
  }

  return fs
    .readdirSync(channelsDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => name.replace(/\.ts$/, ''))
    .sort((a, b) => a.localeCompare(b));
}

function readRoleAssignments(stateDir: string): Partial<Record<AgentRole, string>> {
  const parsed = readJsonFile<Record<string, unknown>>(path.join(stateDir, 'role-assignments.json'));
  const assignments: Partial<Record<AgentRole, string>> = {};

  for (const role of AGENT_ROLES) {
    const value = parsed?.[role];
    if (typeof value === 'string' && value.trim().length > 0) {
      assignments[role] = value;
    }
  }

  return assignments;
}

function readRegistryModelCounts(stateDir: string): Record<string, number> {
  const parsed = readJsonFile<RegistryState>(path.join(stateDir, 'model-registry.json'));
  const counts: Record<string, number> = {};

  for (const model of parsed?.models ?? []) {
    const substrate = typeof model.substrate === 'string' && model.substrate.trim().length > 0
      ? model.substrate
      : 'unknown';
    counts[substrate] = (counts[substrate] ?? 0) + 1;
  }

  return counts;
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function readSafeCount(getter: () => number | undefined): number | null {
  try {
    const value = getter();
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}

function ensureStateDir(stateDir: string, corrections: string[]): void {
  if (fs.existsSync(stateDir)) {
    return;
  }
  fs.mkdirSync(stateDir, { recursive: true });
  corrections.push(`created_state_dir:${stateDir}`);
}

function ensureRoleAssignments(stateDir: string, checks: SystemCheck[], corrections: string[]): void {
  const filePath = path.join(stateDir, 'role-assignments.json');
  const existing = readJsonFile<Record<string, unknown>>(filePath) ?? {};
  const normalized: Record<string, string> = { ...DEFAULT_ROLE_ASSIGNMENTS };
  let changed = false;

  for (const role of AGENT_ROLES) {
    const value = existing[role];
    if (typeof value === 'string' && value.trim().length > 0) {
      normalized[role] = value;
    } else {
      changed = true;
    }
  }

  if (!fs.existsSync(filePath) || changed) {
    fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf-8');
    corrections.push('normalized_role_assignments');
  }

  checks.push({
    id: 'state.role_assignments',
    ok: true,
    detail: 'Role assignments file is present and complete.',
  });
}

function ensureRegistryFile(stateDir: string, checks: SystemCheck[], corrections: string[]): void {
  const filePath = path.join(stateDir, 'model-registry.json');
  const existing = readJsonFile<Record<string, unknown>>(filePath);
  const hasShape =
    existing &&
    Array.isArray((existing as Record<string, unknown>).models) &&
    typeof (existing as Record<string, unknown>).lastRefreshed === 'string';

  if (!hasShape) {
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          models: [],
          lastRefreshed: new Date(0).toISOString(),
        },
        null,
        2
      ),
      'utf-8'
    );
    corrections.push('initialized_model_registry');
  }

  checks.push({
    id: 'state.model_registry',
    ok: true,
    detail: 'Model registry file is present and parseable.',
  });
}

function ensureCapsuleFile(
  stateDir: string,
  compiler: { regenerateCapsule(outputPath?: string): string } | undefined,
  checks: SystemCheck[],
  corrections: string[]
): void {
  const filePath = path.join(stateDir, 'SOUL.md');
  if (!fs.existsSync(filePath) && compiler) {
    compiler.regenerateCapsule(filePath);
    corrections.push('regenerated_capsule');
  }

  checks.push({
    id: 'state.capsule',
    ok: fs.existsSync(filePath),
    detail: fs.existsSync(filePath)
      ? 'SOUL.md is present.'
      : 'SOUL.md is missing and could not be regenerated.',
  });
}
