import fs from 'node:fs';
import path from 'node:path';
import { ModelRegistry } from './registry.js';
import { ModelDescriptor } from './types.js';
import { getStateDir } from '../soul/types.ts';

export type RegistryState = {
  models: ModelDescriptor[];
  lastRefreshed: string;
};

export async function refreshModelRegistry(currentState?: RegistryState): Promise<RegistryState> {
  const registry = new ModelRegistry();
  const discoveredModels = await registry.discoverAllModels();
  const now = new Date().toISOString();

  const discoveredByKey = new Map<string, ModelDescriptor>();
  for (const model of discoveredModels) {
    const key = `${model.provider}:${model.id}`;
    discoveredByKey.set(key, {
      ...model,
      stale: false,
      lastSeenAt: now,
      lastCheckedAt: now,
    });
  }

  const previousModels = currentState?.models ?? [];
  const staleModels: ModelDescriptor[] = [];

  for (const previous of previousModels) {
    const key = `${previous.provider}:${previous.id}`;
    if (!discoveredByKey.has(key)) {
      staleModels.push({
        ...previous,
        stale: true,
      });
    }
  }

  return {
    models: [...discoveredByKey.values(), ...staleModels],
    lastRefreshed: now,
  };
}

export function getRegistryStatePath(stateDir: string = getStateDir()): string {
  return path.join(stateDir, 'model-registry.json');
}

export function loadRegistryState(stateDir: string = getStateDir()): RegistryState | null {
  const filePath = getRegistryStatePath(stateDir);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RegistryState;
  } catch (err) {
    console.warn(`[Registry] Failed to load registry state from ${filePath}:`, err);
    return null;
  }
}

export function saveRegistryState(state: RegistryState, stateDir: string = getStateDir()): void {
  const filePath = getRegistryStatePath(stateDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}
