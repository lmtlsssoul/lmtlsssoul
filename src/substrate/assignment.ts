import fs from 'node:fs';
import path from 'node:path';
import { AGENT_ROLES, getStateDir, type AgentRole } from '../soul/types.ts';
import type { ModelDescriptor, ModelReference, SubstrateId } from './types.ts';

export type { AgentRole } from '../soul/types.ts';

export type RoleAssignments = Record<AgentRole, ModelReference>;

export const DEFAULT_ROLE_ASSIGNMENTS: RoleAssignments = {
  interface: 'anthropic:claude-3-opus-20240229',
  compiler: 'openai:gpt-4o',
  orchestrator: 'openai:gpt-4o',
  scraper: 'ollama:llama3:latest',
  reflection: 'anthropic:claude-3-opus-20240229',
};

/**
 * Backward-compatible export kept for existing imports/tests.
 */
export const roleAssignments = DEFAULT_ROLE_ASSIGNMENTS;

export function getRoleAssignmentsPath(stateDir: string = getStateDir()): string {
  return path.join(stateDir, 'role-assignments.json');
}

export function getRoleAssignments(stateDir: string = getStateDir()): RoleAssignments {
  const filePath = getRoleAssignmentsPath(stateDir);
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_ROLE_ASSIGNMENTS };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<Record<AgentRole, string>>;
    const merged: RoleAssignments = { ...DEFAULT_ROLE_ASSIGNMENTS };

    for (const role of AGENT_ROLES) {
      const value = parsed[role];
      if (value && isModelReference(value)) {
        merged[role] = value;
      }
    }

    return merged;
  } catch (err) {
    console.warn(`[Assignment] Failed to load assignments from ${filePath}:`, err);
    return { ...DEFAULT_ROLE_ASSIGNMENTS };
  }
}

export function saveRoleAssignments(assignments: RoleAssignments, stateDir: string = getStateDir()): void {
  const filePath = getRoleAssignmentsPath(stateDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(assignments, null, 2), 'utf-8');
}

export function setRoleAssignment(
  role: AgentRole,
  modelReference: ModelReference,
  options?: {
    availableModels?: ModelDescriptor[];
    stateDir?: string;
  }
): void {
  if (!AGENT_ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }
  if (!isModelReference(modelReference)) {
    throw new Error(`Invalid model reference "${modelReference}". Expected "<substrate>:<modelId>".`);
  }

  if (options?.availableModels) {
    const resolved = resolveModelReference(modelReference, options.availableModels);
    if (!resolved) {
      throw new Error(`Model reference "${modelReference}" is not grounded by current registry discovery.`);
    }
  }

  const stateDir = options?.stateDir ?? getStateDir();
  const assignments = getRoleAssignments(stateDir);
  assignments[role] = modelReference;
  saveRoleAssignments(assignments, stateDir);
}

export function resolveModelForRole(
  role: AgentRole,
  availableModels: ModelDescriptor[],
  assignments: RoleAssignments = getRoleAssignments()
): ModelDescriptor | null {
  const reference = assignments[role];
  if (!reference) {
    return null;
  }

  return resolveModelReference(reference, availableModels);
}

export function resolveModelReference(
  reference: string,
  availableModels: ModelDescriptor[]
): ModelDescriptor | null {
  const parsed = parseModelReference(reference);
  if (parsed) {
    return (
      availableModels.find(
        (model) => model.substrate === parsed.substrate && model.modelId === parsed.modelId && !model.stale
      ) ?? null
    );
  }

  // Legacy fallback for historical assignment files that only stored model IDs.
  return availableModels.find((model) => model.modelId === reference && !model.stale) ?? null;
}

export function parseModelReference(reference: string): { substrate: SubstrateId; modelId: string } | null {
  const separator = reference.indexOf(':');
  if (separator <= 0 || separator >= reference.length - 1) {
    return null;
  }

  const substrate = reference.slice(0, separator) as SubstrateId;
  const modelId = reference.slice(separator + 1);
  if (!isSubstrateId(substrate) || !modelId) {
    return null;
  }

  return { substrate, modelId };
}

function isModelReference(value: string): value is ModelReference {
  return parseModelReference(value) !== null;
}

function isSubstrateId(value: string): value is SubstrateId {
  return value === 'openai' || value === 'anthropic' || value === 'xai' || value === 'ollama';
}
