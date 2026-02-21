import type { AgentRole } from './types.ts';
import { AGENT_ROLES } from './types.ts';
import type { ModelDescriptor, ModelReference, SubstrateId } from '../substrate/types.ts';
import { refreshModelRegistry, loadRegistryState, saveRegistryState } from '../substrate/refresh.ts';
import { parseModelReference, setRoleAssignment } from '../substrate/assignment.ts';

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
    grouped[model.substrate].push(model);
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
  const matches = availableModels.filter((model) => model.modelId === modelReferenceOrId && !model.stale);
  if (matches.length === 1) {
    return `${matches[0].substrate}:${matches[0].modelId}`;
  }

  if (matches.length === 0) {
    throw new Error(
      `Model "${modelReferenceOrId}" is not available in discovered registry state. Use "<substrata>:<modelId>".`
    );
  }

  throw new Error(
    `Model ID "${modelReferenceOrId}" is ambiguous across substrata. Use "<substrata>:<modelId>".`
  );
}

function isAgentRole(value: string): value is AgentRole {
  return (AGENT_ROLES as readonly string[]).includes(value);
}
