import type { AgentRole } from './types.ts';
import { AGENT_ROLES } from './types.ts';
import type { ModelDescriptor, ModelReference, SubstrateId } from '../substrate/types.js';
import { refreshModelRegistry, loadRegistryState, saveRegistryState } from '../substrate/refresh.js';
import { parseModelReference, setRoleAssignment } from '../substrate/assignment.js';

export async function scanForModels(options?: {
  persist?: boolean;
  stateDir?: string;
}): Promise<Record<SubstrateId, ModelDescriptor[]>> {
  const persist = options?.persist ?? true;
  const previousState = loadRegistryState(options?.stateDir) ?? undefined;
  const nextState = await refreshModelRegistry(previousState);

  if (persist) {
    saveRegistryState(nextState, options?.stateDir);
  }

  const grouped: Record<SubstrateId, ModelDescriptor[]> = {
    openai: [],
    anthropic: [],
    xai: [],
    ollama: [],
  };

  for (const model of nextState.models) {
    grouped[model.provider].push(model);
  }

  return grouped;
}

export async function setModelForRole(
  role: string,
  modelReferenceOrId: string,
  options?: {
    stateDir?: string;
    availableModels?: ModelDescriptor[];
  }
): Promise<void> {
  if (!isAgentRole(role)) {
    throw new Error(`Invalid role "${role}". Expected one of: ${AGENT_ROLES.join(', ')}`);
  }

  const availableModels =
    options?.availableModels ?? Object.values(await scanForModels({ stateDir: options?.stateDir })).flat();
  const resolvedReference = normalizeModelReference(modelReferenceOrId, availableModels);

  setRoleAssignment(role, resolvedReference, {
    stateDir: options?.stateDir,
    availableModels,
  });
}

function normalizeModelReference(
  modelReferenceOrId: string,
  availableModels: ModelDescriptor[]
): ModelReference {
  const parsed = parseModelReference(modelReferenceOrId);
  if (parsed) {
    return modelReferenceOrId as ModelReference;
  }

  // Backward-compatible shorthand: plain model id. Must resolve uniquely.
  const matches = availableModels.filter((model) => model.id === modelReferenceOrId && !model.stale);
  if (matches.length === 1) {
    return `${matches[0].provider}:${matches[0].id}`;
  }

  if (matches.length === 0) {
    throw new Error(
      `Model "${modelReferenceOrId}" is not available in discovered registry state. Use "<substrate>:<modelId>".`
    );
  }

  throw new Error(
    `Model ID "${modelReferenceOrId}" is ambiguous across substrates. Use "<substrate>:<modelId>".`
  );
}

function isAgentRole(value: string): value is AgentRole {
  return (AGENT_ROLES as readonly string[]).includes(value);
}
