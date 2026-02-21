import enquirer from 'enquirer';
import fs from 'node:fs';
import path from 'node:path';
import { getStateDir } from './types.ts';
import { loadRegistryState, refreshModelRegistry, saveRegistryState } from '../substrate/refresh.ts';
import type { SubstrateId } from '../substrate/types.ts';
import { warn } from './branding.ts';

export type CredentialCategory = 'provider' | 'tool' | 'channel' | 'service';
export type CredentialAuthMode = 'api_key' | 'oauth';

export type CredentialRequirement = {
  env: string;
  label: string;
  secret: boolean;
  optional?: boolean;
};

export type CredentialEntry = {
  id: string;
  category: CredentialCategory;
  label: string;
  description: string;
  provider?: string;
  authModes: CredentialAuthMode[];
  requirements: CredentialRequirement[];
  oauthHintUrl?: string;
  source: 'builtin' | 'remote' | 'discovered';
};

export type CredentialCatalogState = {
  lastRefreshed: string;
  entries: CredentialEntry[];
  sources: string[];
  providerModelHints?: Record<string, string[]>;
};

export type CredentialSetupResult = {
  secrets: Record<string, string>;
  selected: {
    providers: string[];
    tools: string[];
    channels: string[];
    services: string[];
  };
  providerModelSelections: Record<string, string[]>;
  catalogLastRefreshed: string;
};

const DEFAULT_CREDENTIAL_CATEGORIES: CredentialCategory[] = [
  'provider',
  'tool',
  'channel',
  'service',
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const OPENCLAW_DOCS_RAW_BASE = 'https://raw.githubusercontent.com/OpenClaw/openclaw/main/docs';
const DEFAULT_REMOTE_CATALOG_TEXT_URLS = [
  `${OPENCLAW_DOCS_RAW_BASE}/providers/index.md`,
  `${OPENCLAW_DOCS_RAW_BASE}/concepts/model-providers.md`,
  `${OPENCLAW_DOCS_RAW_BASE}/tools/index.md`,
  `${OPENCLAW_DOCS_RAW_BASE}/tools/web.md`,
];
const REMOTE_DISCOVERY_MAX_URLS = 96;

const CHANNEL_ENV_PREFIXES = new Set([
  'TELEGRAM',
  'SLACK',
  'DISCORD',
  'WHATSAPP',
  'SIGNAL',
  'MSTEAMS',
  'GOOGLECHAT',
  'IRC',
  'LINE',
  'MATTERMOST',
  'FEISHU',
  'ZALO',
  'TWITCH',
]);

const TOOL_ENV_PREFIXES = new Set([
  'BRAVE',
  'SERPER',
  'TAVILY',
  'SERPAPI',
  'FIRECRAWL',
  'GITHUB',
  'EXA',
  'PERPLEXITY',
  'JINA',
  'BROWSERBASE',
  'PLAYWRIGHT',
  'WOLFRAM',
  'COHERE',
  'NOTION',
  'PINECONE',
  'WEAVIATE',
  'QDRANT',
  'MILVUS',
  'ELASTIC',
]);

const PROVIDER_ID_ALIASES: Record<string, string> = {
  'x.ai': 'xai',
  'x-ai': 'xai',
  zai: 'zai',
  'z.ai': 'zai',
  'z-ai': 'zai',
  'google-gemini': 'google',
  gemini: 'google',
  'open-ai': 'openai',
  'open-ai-codex': 'openai-codex',
  'github-copilot': 'github-copilot',
  'vercel-ai-gateway': 'vercel-ai-gateway',
  'cloudflare-ai-gateway': 'cloudflare-ai-gateway',
};

const NON_PROVIDER_SLUGS = new Set([
  'providers',
  'models',
  'model',
  'tools',
  'tool',
  'index',
  'overview',
  'concepts',
  'gateway',
  'help',
  'docs',
  'openclaw',
  'api',
]);

type RemoteCatalogDiscovery = {
  entries: CredentialEntry[];
  providerModelHints: Record<string, string[]>;
  fetchedUrls: string[];
};

const BUILTIN_CREDENTIALS: readonly CredentialEntry[] = [
  // Providers
  {
    id: 'provider_openai',
    category: 'provider',
    label: 'OpenAI',
    provider: 'openai',
    description: 'OpenAI model provider',
    authModes: ['api_key'],
    requirements: [
      { env: 'OPENAI_API_KEY', label: 'API Key', secret: true },
      { env: 'OPENAI_BASE_URL', label: 'Base URL (optional)', secret: false, optional: true },
    ],
    source: 'builtin',
  },
  {
    id: 'provider_anthropic',
    category: 'provider',
    label: 'Anthropic',
    provider: 'anthropic',
    description: 'Anthropic model provider',
    authModes: ['api_key', 'oauth'],
    requirements: [
      { env: 'ANTHROPIC_API_KEY', label: 'API Key', secret: true, optional: true },
      { env: 'ANTHROPIC_OAUTH_TOKEN', label: 'OAuth Token', secret: true, optional: true },
      { env: 'ANTHROPIC_BASE_URL', label: 'Base URL (optional)', secret: false, optional: true },
    ],
    oauthHintUrl: 'https://console.anthropic.com',
    source: 'builtin',
  },
  {
    id: 'provider_xai',
    category: 'provider',
    label: 'xAI',
    provider: 'xai',
    description: 'xAI model provider',
    authModes: ['api_key'],
    requirements: [
      { env: 'XAI_API_KEY', label: 'API Key', secret: true },
      { env: 'XAI_BASE_URL', label: 'Base URL (optional)', secret: false, optional: true },
    ],
    source: 'builtin',
  },
  {
    id: 'provider_ollama',
    category: 'provider',
    label: 'Ollama',
    provider: 'ollama',
    description: 'Local Ollama runtime',
    authModes: ['api_key'],
    requirements: [
      { env: 'OLLAMA_BASE_URL', label: 'Base URL', secret: false, optional: true },
    ],
    source: 'builtin',
  },
  {
    id: 'provider_google',
    category: 'provider',
    label: 'Google/Gemini',
    provider: 'google',
    description: 'Google model provider',
    authModes: ['api_key'],
    requirements: [
      { env: 'GOOGLE_API_KEY', label: 'API Key', secret: true },
      { env: 'GEMINI_API_KEY', label: 'Gemini API Key (optional)', secret: true, optional: true },
    ],
    source: 'builtin',
  },
  {
    id: 'provider_groq',
    category: 'provider',
    label: 'Groq',
    provider: 'groq',
    description: 'Groq model provider',
    authModes: ['api_key'],
    requirements: [{ env: 'GROQ_API_KEY', label: 'API Key', secret: true }],
    source: 'builtin',
  },
  {
    id: 'provider_openrouter',
    category: 'provider',
    label: 'OpenRouter',
    provider: 'openrouter',
    description: 'OpenRouter model provider',
    authModes: ['api_key'],
    requirements: [{ env: 'OPENROUTER_API_KEY', label: 'API Key', secret: true }],
    source: 'builtin',
  },
  // Tools
  {
    id: 'tool_brave_search',
    category: 'tool',
    label: 'Brave Search',
    description: 'Web search',
    authModes: ['api_key'],
    requirements: [{ env: 'BRAVE_API_KEY', label: 'API Key', secret: true }],
    source: 'builtin',
  },
  {
    id: 'tool_serper_search',
    category: 'tool',
    label: 'Serper Search',
    description: 'Google search API',
    authModes: ['api_key'],
    requirements: [{ env: 'SERPER_API_KEY', label: 'API Key', secret: true }],
    source: 'builtin',
  },
  {
    id: 'tool_tavily_search',
    category: 'tool',
    label: 'Tavily Search',
    description: 'Retrieval/search',
    authModes: ['api_key'],
    requirements: [{ env: 'TAVILY_API_KEY', label: 'API Key', secret: true }],
    source: 'builtin',
  },
  {
    id: 'tool_serpapi',
    category: 'tool',
    label: 'SerpAPI',
    description: 'Search API',
    authModes: ['api_key'],
    requirements: [{ env: 'SERPAPI_API_KEY', label: 'API Key', secret: true }],
    source: 'builtin',
  },
  {
    id: 'tool_firecrawl',
    category: 'tool',
    label: 'Firecrawl',
    description: 'Web extraction/crawl',
    authModes: ['api_key'],
    requirements: [{ env: 'FIRECRAWL_API_KEY', label: 'API Key', secret: true }],
    source: 'builtin',
  },
  {
    id: 'tool_github',
    category: 'tool',
    label: 'GitHub',
    description: 'Repository and API access',
    authModes: ['api_key', 'oauth'],
    requirements: [
      { env: 'GITHUB_TOKEN', label: 'Token', secret: true, optional: true },
      { env: 'GH_TOKEN', label: 'GH Token (optional)', secret: true, optional: true },
      { env: 'COPILOT_GITHUB_TOKEN', label: 'Copilot Token (optional)', secret: true, optional: true },
    ],
    source: 'builtin',
  },
  // Channels
  {
    id: 'channel_telegram',
    category: 'channel',
    label: 'Telegram',
    description: 'Telegram bot channel',
    authModes: ['api_key'],
    requirements: [{ env: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token', secret: true }],
    source: 'builtin',
  },
  {
    id: 'channel_slack',
    category: 'channel',
    label: 'Slack',
    description: 'Slack channel',
    authModes: ['oauth'],
    requirements: [{ env: 'SLACK_BOT_TOKEN', label: 'Bot Token', secret: true }],
    source: 'builtin',
  },
];

export function getCredentialCatalogPath(stateDir: string = getStateDir()): string {
  return path.join(stateDir, 'credential-catalog.json');
}

export function getToolKeysPath(stateDir: string = getStateDir()): string {
  return path.join(stateDir, 'tool-keys.json');
}

export function loadToolKeys(stateDir: string = getStateDir()): Record<string, string> {
  const filePath = getToolKeysPath(stateDir);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        out[key] = value.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function persistToolKeys(
  secrets: Record<string, string>,
  stateDir: string = getStateDir()
): { path: string; count: number } {
  const current = loadToolKeys(stateDir);
  const merged: Record<string, string> = { ...current };
  for (const [env, value] of Object.entries(secrets)) {
    const trimmed = value.trim();
    if (trimmed) {
      merged[env] = trimmed;
    }
  }

  const filePath = getToolKeysPath(stateDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
  fs.chmodSync(filePath, 0o600);
  return { path: filePath, count: Object.keys(merged).length };
}

export function loadCredentialCatalog(stateDir: string = getStateDir()): CredentialCatalogState | null {
  const filePath = getCredentialCatalogPath(stateDir);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CredentialCatalogState;
  } catch {
    return null;
  }
}

export function saveCredentialCatalog(state: CredentialCatalogState, stateDir: string = getStateDir()): void {
  const filePath = getCredentialCatalogPath(stateDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

export async function ensureCredentialCatalog(stateDir: string = getStateDir()): Promise<CredentialCatalogState> {
  const current = loadCredentialCatalog(stateDir);
  if (current && !isStale(current.lastRefreshed, ONE_DAY_MS)) {
    return current;
  }
  return refreshCredentialCatalog(stateDir, current ?? undefined);
}

export async function refreshCredentialCatalog(
  stateDir: string = getStateDir(),
  existing?: CredentialCatalogState
): Promise<CredentialCatalogState> {
  const discovered = discoverCredentialEntriesFromSource();
  const remoteDiscovery = await discoverCredentialEntriesFromRemoteText();

  const deduped = dedupeEntries([...BUILTIN_CREDENTIALS, ...discovered, ...remoteDiscovery.entries]);
  const next: CredentialCatalogState = {
    lastRefreshed: new Date().toISOString(),
    entries: deduped,
    sources: [
      'builtin',
      'local_source_scan',
      ...(remoteDiscovery.entries.length > 0 ? ['remote_text_scan'] : []),
      ...(existing?.sources ?? []),
    ].concat(remoteDiscovery.fetchedUrls.map((url) => `remote:${url}`)),
    providerModelHints:
      Object.keys(remoteDiscovery.providerModelHints).length > 0
        ? remoteDiscovery.providerModelHints
        : (existing?.providerModelHints ?? {}),
  };
  saveCredentialCatalog(next, stateDir);
  return next;
}

export async function runCredentialSetupMenu(options?: {
  stateDir?: string;
  heading?: string;
  existingSecrets?: Record<string, string>;
  allowedCategories?: CredentialCategory[];
}): Promise<CredentialSetupResult> {
  const stateDir = options?.stateDir ?? getStateDir();
  const catalog = await ensureCredentialCatalog(stateDir);
  const grouped = groupByCategory(catalog.entries);
  const allowedCategories = normalizeAllowedCategories(options?.allowedCategories);
  const secrets: Record<string, string> = {
    ...(options?.existingSecrets ?? {}),
  };

  const selected = {
    providers: new Set<string>(),
    tools: new Set<string>(),
    channels: new Set<string>(),
    services: new Set<string>(),
  };
  const providerModelSelections: Record<string, string[]> = {};

  if (options?.heading) {
    console.log(options.heading);
  }

  const categoryChoiceMap = new Map<string, CredentialCategory>();
  const categoryChoices: string[] = [];
  for (const category of allowedCategories) {
    const label = categoryMenuLabel(category, grouped[category].length);
    categoryChoiceMap.set(label, category);
    categoryChoices.push(label);
  }

  while (true) {
    const topChoice = await promptSelect(
      'Credential setup menu',
      [
        ...categoryChoices,
        'Add custom credential',
        'Done',
      ],
      0
    );

    if (topChoice === 'Done') {
      break;
    }

    if (topChoice === 'Add custom credential') {
      await configureCustomCredential(secrets);
      continue;
    }

    const category = categoryChoiceMap.get(topChoice) ?? null;
    if (!category) {
      warn(`Unknown credential category selection: "${topChoice}"`);
      continue;
    }
    const entries = grouped[category] ?? [];
    if (entries.length === 0) {
      warn(`No entries available in category "${category}" right now.`);
      continue;
    }

    const selectedLabels = await promptMultiSelectWithFallback(
      `Select ${category} entries to configure`,
      entries.map((entry) => entryToChoiceLabel(entry))
    );
    if (selectedLabels.length === 0) {
      continue;
    }

    for (const label of selectedLabels) {
      const entry = entries.find((candidate) => entryToChoiceLabel(candidate) === label);
      if (!entry) {
        continue;
      }

      const configured = await configureCredentialEntry(entry, secrets);
      if (!configured) {
        continue;
      }

      if (entry.category === 'provider') {
        const providerId = normalizeProviderId(entry.provider ?? entry.label);
        selected.providers.add(providerId ?? entry.provider ?? entry.label);
        if (providerId) {
          const modelSelections = await selectModelsForProvider(
            providerId,
            stateDir,
            catalog.providerModelHints
          );
          if (modelSelections.length > 0) {
            providerModelSelections[providerId] = modelSelections;
          }
        }
      } else if (entry.category === 'tool') {
        selected.tools.add(entry.label);
      } else if (entry.category === 'channel') {
        selected.channels.add(entry.label);
      } else {
        selected.services.add(entry.label);
      }
    }
  }

  return {
    secrets,
    selected: {
      providers: Array.from(selected.providers),
      tools: Array.from(selected.tools),
      channels: Array.from(selected.channels),
      services: Array.from(selected.services),
    },
    providerModelSelections,
    catalogLastRefreshed: catalog.lastRefreshed,
  };
}

export async function runProviderCredentialSetupMenu(options?: {
  stateDir?: string;
  heading?: string;
  existingSecrets?: Record<string, string>;
  providerAllowlist?: string[];
}): Promise<CredentialSetupResult> {
  const stateDir = options?.stateDir ?? getStateDir();
  const catalog = await ensureCredentialCatalog(stateDir);
  const grouped = groupByCategory(catalog.entries);
  const allowSet = new Set(
    (options?.providerAllowlist ?? [])
      .map((value) => normalizeProviderId(value))
      .filter((value): value is string => Boolean(value))
  );

  const providerEntries = grouped.provider.filter((entry) => {
    if (allowSet.size === 0) {
      return true;
    }
    const provider = normalizeProviderId(entry.provider ?? entry.label);
    return typeof provider === 'string' && provider.length > 0 && allowSet.has(provider);
  });
  const secrets: Record<string, string> = {
    ...(options?.existingSecrets ?? {}),
  };
  const selectedProviders = new Set<string>();
  const providerModelSelections: Record<string, string[]> = {};

  if (options?.heading) {
    console.log(options.heading);
  }

  if (providerEntries.length === 0) {
    warn('No provider entries available right now.');
    return {
      secrets,
      selected: {
        providers: [],
        tools: [],
        channels: [],
        services: [],
      },
      providerModelSelections,
      catalogLastRefreshed: catalog.lastRefreshed,
    };
  }

  const selectedLabels = await promptMultiSelectWithFallback(
    'Select providers to configure',
    providerEntries.map((entry) => entryToChoiceLabel(entry))
  );

  for (const label of selectedLabels) {
    const entry = providerEntries.find((candidate) => entryToChoiceLabel(candidate) === label);
    if (!entry) {
      continue;
    }

    const configured = await configureCredentialEntry(entry, secrets);
    if (!configured) {
      continue;
    }

    const providerId = normalizeProviderId(entry.provider ?? entry.label);
    selectedProviders.add(providerId ?? entry.provider ?? entry.label);
    if (!providerId) {
      continue;
    }
    const modelSelections = await selectModelsForProvider(
      providerId,
      stateDir,
      catalog.providerModelHints
    );
    if (modelSelections.length > 0) {
      providerModelSelections[providerId] = modelSelections;
    }
  }

  return {
    secrets,
    selected: {
      providers: Array.from(selectedProviders),
      tools: [],
      channels: [],
      services: [],
    },
    providerModelSelections,
    catalogLastRefreshed: catalog.lastRefreshed,
  };
}

async function selectModelsForProvider(
  provider: string,
  stateDir: string,
  providerHints?: Record<string, string[]>
): Promise<string[]> {
  const models = await getProviderModels(provider, stateDir, providerHints);
  if (models.length === 0) {
    return [];
  }
  return await promptMultiSelectWithFallback(
    `Select relevant models for provider "${provider}"`,
    models
  );
}

async function getProviderModels(
  provider: string,
  stateDir: string,
  providerHints?: Record<string, string[]>
): Promise<string[]> {
  const normalizedProvider = normalizeProviderId(provider) ?? provider.trim().toLowerCase();
  let registry = loadRegistryState(stateDir);
  if (!registry || isStale(registry.lastRefreshed, ONE_DAY_MS)) {
    try {
      registry = await refreshModelRegistry(registry ?? undefined);
      saveRegistryState(registry, stateDir);
    } catch {
      // Keep old data if refresh fails.
    }
  }

  const substrateId = toSubstrateId(normalizedProvider);
  const liveModels = (registry?.models ?? [])
    .filter((model) => substrateId != null && model.substrate === substrateId && !model.stale)
    .map((model) => model.modelId);
  const hintedModels = providerHints?.[normalizedProvider] ?? [];

  return Array.from(new Set([...liveModels, ...hintedModels])).sort((a, b) => a.localeCompare(b));
}

async function configureCredentialEntry(
  entry: CredentialEntry,
  secrets: Record<string, string>
): Promise<boolean> {
  let mode: CredentialAuthMode | null = null;
  if (entry.authModes.length === 1) {
    mode = entry.authModes[0] ?? null;
  } else {
    const choice = await promptSelect(
      `Auth method for ${entry.label}`,
      ['API key', 'OAuth', 'Skip'],
      0
    );
    if (choice === 'Skip') {
      return false;
    }
    mode = choice === 'OAuth' ? 'oauth' : 'api_key';
  }

  if (mode === 'oauth' && entry.oauthHintUrl) {
    console.log(`OAuth hint: ${entry.oauthHintUrl}`);
  }

  const requirements = entry.requirements.filter((requirement) => {
    if (mode === 'oauth') {
      return requirement.env.includes('OAUTH') || requirement.optional;
    }
    if (mode === 'api_key') {
      return !requirement.env.includes('OAUTH');
    }
    return true;
  });

  for (const requirement of requirements) {
    await captureRequirementValue(requirement, secrets);
  }

  // If oauth mode is selected and no oauth requirement exists, still allow token paste.
  if (mode === 'oauth' && requirements.length === 0) {
    const inferredEnv = `${normalizeEnvToken(entry.provider ?? entry.label)}_OAUTH_TOKEN`;
    await captureRequirementValue(
      {
        env: inferredEnv,
        label: 'OAuth Token',
        secret: true,
      },
      secrets
    );
  }

  return true;
}

async function captureRequirementValue(
  requirement: CredentialRequirement,
  secrets: Record<string, string>
): Promise<void> {
  const existing = (secrets[requirement.env] ?? process.env[requirement.env] ?? '').trim();
  if (existing) {
    const action = await promptSelect(
      `${requirement.env} already present. Choose action`,
      [
        'Use existing value',
        'Enter new value',
        'Skip',
      ],
      0
    );
    if (action === 'Use existing value') {
      secrets[requirement.env] = existing;
      return;
    }
    if (action === 'Skip') {
      return;
    }
  } else {
    const action = await promptSelect(
      `Configure ${requirement.env}?`,
      ['Yes', 'Skip'],
      requirement.optional ? 1 : 0
    );
    if (action === 'Skip') {
      return;
    }
  }

  const promptMessage = `Enter ${requirement.env}${requirement.label ? ` (${requirement.label})` : ''}`;
  const value = requirement.secret ? await promptSecret(promptMessage) : await promptInput(promptMessage);
  if (!value.trim()) {
    return;
  }
  secrets[requirement.env] = value.trim();
}

async function configureCustomCredential(secrets: Record<string, string>): Promise<void> {
  const env = (await promptInput('Custom env var name (e.g., MY_SERVICE_API_KEY)')).trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,}$/.test(env)) {
    warn('Invalid env var name; skipped.');
    return;
  }
  const mode = await promptSelect('Custom credential auth type', ['Secret value', 'Plain value'], 0);
  const value = mode === 'Secret value'
    ? await promptSecret(`Enter ${env}`)
    : await promptInput(`Enter ${env}`);
  if (!value.trim()) {
    return;
  }
  secrets[env] = value.trim();
}

function groupByCategory(entries: CredentialEntry[]): Record<CredentialCategory, CredentialEntry[]> {
  const grouped: Record<CredentialCategory, CredentialEntry[]> = {
    provider: [],
    tool: [],
    channel: [],
    service: [],
  };
  for (const entry of entries) {
    grouped[entry.category].push(entry);
  }
  for (const key of Object.keys(grouped) as CredentialCategory[]) {
    grouped[key].sort((a, b) => a.label.localeCompare(b.label));
  }
  return grouped;
}

function entryToChoiceLabel(entry: CredentialEntry): string {
  const mode = entry.authModes.map((value) => value.toUpperCase()).join('/');
  const source = entry.source === 'builtin' ? 'core' : entry.source;
  return `${entry.label} [${entry.category}] [${mode}] (${source}) — ${entry.description}`;
}

function dedupeEntries(entries: CredentialEntry[]): CredentialEntry[] {
  const byId = new Map<string, CredentialEntry>();
  const byRequirement = new Map<string, string>();
  const byProvider = new Map<string, string>();

  for (const entry of entries) {
    const normalized = normalizeEntry(entry);
    if (byId.has(normalized.id)) {
      continue;
    }

    const requirementKey = normalized.requirements
      .map((value) => value.env)
      .sort()
      .join('|');
    if (requirementKey && byRequirement.has(requirementKey)) {
      continue;
    }

    if (normalized.category === 'provider') {
      const providerKey = normalizeProviderId(normalized.provider ?? normalized.label);
      if (providerKey) {
        const existingId = byProvider.get(providerKey);
        if (existingId) {
          const existing = byId.get(existingId);
          const existingIsBuiltin = existing?.source === 'builtin';
          const incomingIsBuiltin = normalized.source === 'builtin';
          if (existingIsBuiltin && !incomingIsBuiltin) {
            continue;
          }
          if (incomingIsBuiltin) {
            byId.delete(existingId);
          } else {
            continue;
          }
        }
        byProvider.set(providerKey, normalized.id);
      }
    }

    byId.set(normalized.id, normalized);
    if (requirementKey) {
      byRequirement.set(requirementKey, normalized.id);
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function normalizeEntry(entry: CredentialEntry): CredentialEntry {
  const requirements = entry.requirements
    .map((requirement) => ({
      ...requirement,
      env: requirement.env.trim().toUpperCase(),
      label: requirement.label.trim(),
      secret: Boolean(requirement.secret),
      optional: Boolean(requirement.optional),
    }))
    .filter((requirement) => requirement.env.length > 0);

  return {
    ...entry,
    id: entry.id.trim().toLowerCase(),
    label: entry.label.trim(),
    description: entry.description.trim(),
    authModes: Array.from(new Set(entry.authModes)),
    requirements,
  };
}

function discoverCredentialEntriesFromSource(): CredentialEntry[] {
  const srcDir = path.resolve(process.cwd(), 'src');
  if (!fs.existsSync(srcDir)) {
    return [];
  }

  const envNames = new Set<string>();
  for (const filePath of walkFiles(srcDir)) {
    if (!filePath.endsWith('.ts')) {
      continue;
    }
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    const matches = content.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g);
    for (const match of matches) {
      const env = match[1]?.trim().toUpperCase();
      if (!env) {
        continue;
      }
      if (looksCredentialLike(env)) {
        envNames.add(env);
      }
    }
  }

  const discovered: CredentialEntry[] = [];
  for (const env of envNames) {
    discovered.push(entryFromEnvName(env, 'discovered'));
  }
  return discovered;
}

async function discoverCredentialEntriesFromRemoteText(): Promise<RemoteCatalogDiscovery> {
  const urls = resolveRemoteCatalogTextUrls();
  if (urls.length === 0) {
    return {
      entries: [],
      providerModelHints: {},
      fetchedUrls: [],
    };
  }

  const envNames = new Set<string>();
  const providerIds = new Set<string>();
  const providerModelHints = new Map<string, Set<string>>();
  const fetchedUrls = new Set<string>();
  const queue: string[] = [...urls];
  const seen = new Set<string>();

  while (queue.length > 0 && seen.size < REMOTE_DISCOVERY_MAX_URLS) {
    const candidate = queue.shift() ?? '';
    const url = normalizeRemoteCatalogUrl(candidate);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);

    try {
      const text = await requestText(url);
      fetchedUrls.add(url);
      collectCredentialEnvTokensFromText(text, envNames);
      collectProviderIdsFromText(text, providerIds);
      collectProviderModelHintsFromText(text, providerModelHints);
      const linkedUrls = extractLinkedRemoteCatalogUrls(text);
      for (const linkedUrl of linkedUrls) {
        if (!seen.has(linkedUrl)) {
          queue.push(linkedUrl);
        }
      }
    } catch {
      // Remote discovery should never block local setup.
    }
  }

  const remote: CredentialEntry[] = [];
  for (const env of envNames) {
    remote.push(entryFromEnvName(env, 'remote'));
  }

  const builtinProviders = new Set(
    BUILTIN_CREDENTIALS
      .filter((entry) => entry.category === 'provider')
      .map((entry) => normalizeProviderId(entry.provider ?? entry.label))
      .filter((value): value is string => Boolean(value))
  );
  for (const providerId of providerIds) {
    if (builtinProviders.has(providerId)) {
      continue;
    }
    remote.push(entryFromProviderId(providerId, 'remote'));
  }

  const providerModelHintsObject: Record<string, string[]> = {};
  for (const [providerId, models] of providerModelHints.entries()) {
    if (models.size === 0) {
      continue;
    }
    providerModelHintsObject[providerId] = Array.from(models).sort((a, b) => a.localeCompare(b));
  }

  return {
    entries: remote,
    providerModelHints: providerModelHintsObject,
    fetchedUrls: Array.from(fetchedUrls),
  };
}

function resolveRemoteCatalogTextUrls(): string[] {
  const configured = (process.env.SOUL_CREDENTIAL_CATALOG_URLS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length > 0) {
    return configured
      .map((value) => normalizeRemoteCatalogUrl(value))
      .filter((value): value is string => Boolean(value));
  }
  return DEFAULT_REMOTE_CATALOG_TEXT_URLS;
}

function normalizeRemoteCatalogUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const normalizedPath = trimmed.replace(/^\/+/, '');
  if (!normalizedPath.endsWith('.md')) {
    return `${OPENCLAW_DOCS_RAW_BASE}/${normalizedPath}.md`;
  }
  return `${OPENCLAW_DOCS_RAW_BASE}/${normalizedPath}`;
}

function collectCredentialEnvTokensFromText(text: string, envNames: Set<string>): void {
  const matches = text.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g);
  for (const match of matches) {
    const token = match[1]?.trim().toUpperCase();
    if (!token) {
      continue;
    }
    if (looksCredentialLike(token)) {
      envNames.add(token);
    }
  }
}

function collectProviderIdsFromText(text: string, providerIds: Set<string>): void {
  const providerFromLabelMatches = text.matchAll(/Provider:\s*`([^`]+)`/gi);
  for (const match of providerFromLabelMatches) {
    const normalized = normalizeProviderId(match[1] ?? '');
    if (normalized && isLikelyProviderId(normalized)) {
      providerIds.add(normalized);
    }
  }

  const providerFromLinkMatches = text.matchAll(/\/providers\/([a-z0-9][a-z0-9.-]*)/gi);
  for (const match of providerFromLinkMatches) {
    const normalized = normalizeProviderId(match[1] ?? '');
    if (normalized && isLikelyProviderId(normalized)) {
      providerIds.add(normalized);
    }
  }
}

function collectProviderModelHintsFromText(text: string, providerModelHints: Map<string, Set<string>>): void {
  const modelRefMatches = text.matchAll(/`([a-z0-9][a-z0-9.-]{1,63})\/([a-z0-9][a-z0-9._:+-]{1,255})`/gi);
  for (const match of modelRefMatches) {
    const providerId = normalizeProviderId(match[1] ?? '');
    const modelId = (match[2] ?? '').trim();
    if (!providerId || !modelId || !isLikelyProviderId(providerId)) {
      continue;
    }
    const bucket = providerModelHints.get(providerId) ?? new Set<string>();
    bucket.add(modelId);
    providerModelHints.set(providerId, bucket);
  }
}

function extractLinkedRemoteCatalogUrls(text: string): string[] {
  const out = new Set<string>();
  const linkMatches = text.matchAll(/\[[^\]]+\]\((\/[^)]+)\)/g);
  for (const match of linkMatches) {
    const rawLink = match[1] ?? '';
    const link = rawLink.split('#')[0]?.split('?')[0]?.trim() ?? '';
    if (!link.startsWith('/')) {
      continue;
    }
    const segments = link.replace(/^\/+/, '').split('/').filter(Boolean);
    const root = segments[0] ?? '';
    if (root !== 'providers' && root !== 'tools') {
      continue;
    }
    const slug = segments[1];
    const suffix = slug ? `${root}/${slug}.md` : `${root}/index.md`;
    out.add(`${OPENCLAW_DOCS_RAW_BASE}/${suffix}`);
  }
  return Array.from(out);
}

function isLikelyProviderId(providerId: string): boolean {
  const normalized = providerId.trim().toLowerCase();
  if (!normalized || normalized.length < 2) {
    return false;
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
    return false;
  }
  return !NON_PROVIDER_SLUGS.has(normalized);
}

function entryFromEnvName(env: string, source: 'remote' | 'discovered'): CredentialEntry {
  const prefix = env.split('_')[0] ?? env;
  const provider = normalizeProviderId(prefix);
  const category = inferCategory(env, provider);
  const label = toTitleCase(prefix.replace(/-/g, '_'));
  const authModes: CredentialAuthMode[] = env.includes('OAUTH') ? ['oauth'] : ['api_key'];

  return {
    id: `${source}_${env.toLowerCase()}`,
    category,
    label:
      category === 'provider'
        ? label
        : category === 'tool'
        ? `${label} Tool`
        : category === 'channel'
        ? `${label} Channel`
        : `${label} Service`,
    provider: category === 'provider' ? (provider ?? undefined) : undefined,
    description: `Discovered from ${source === 'remote' ? 'remote catalog scan' : 'local source scan'}`,
    authModes,
    requirements: [
      {
        env,
        label: env,
        secret: looksSensitive(env),
      },
    ],
    source,
  };
}

function entryFromProviderId(providerId: string, source: 'remote' | 'discovered'): CredentialEntry {
  const normalizedProvider = normalizeProviderId(providerId) ?? providerId.trim().toLowerCase();
  const envToken = normalizeEnvToken(normalizedProvider);

  return {
    id: `${source}_provider_${normalizedProvider}`,
    category: 'provider',
    label: toTitleCase(normalizedProvider.replace(/-/g, '_')),
    provider: normalizedProvider,
    description: `Discovered provider catalog entry (${source === 'remote' ? 'remote scan' : 'local scan'})`,
    authModes: ['api_key', 'oauth'],
    requirements: [
      {
        env: `${envToken}_API_KEY`,
        label: 'API Key',
        secret: true,
        optional: true,
      },
      {
        env: `${envToken}_OAUTH_TOKEN`,
        label: 'OAuth Token',
        secret: true,
        optional: true,
      },
    ],
    source,
  };
}

function inferCategory(env: string, provider: string | null): CredentialCategory {
  const prefix = (env.split('_')[0] ?? '').toUpperCase();
  if (CHANNEL_ENV_PREFIXES.has(prefix) || env.includes('BOT_TOKEN')) {
    return 'channel';
  }
  if (TOOL_ENV_PREFIXES.has(prefix)) {
    return 'tool';
  }
  if (provider) {
    return 'provider';
  }
  return 'service';
}

function normalizeProviderId(value: string): string | null {
  const lowered = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!lowered) {
    return null;
  }

  const alias = PROVIDER_ID_ALIASES[lowered];
  const normalized = alias ?? lowered;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
    return null;
  }
  if (NON_PROVIDER_SLUGS.has(normalized)) {
    return null;
  }
  return normalized;
}

function toSubstrateId(value: string): SubstrateId | null {
  const normalized = normalizeProviderId(value);
  if (!normalized) {
    return null;
  }
  if (normalized === 'openai') return 'openai';
  if (normalized === 'anthropic') return 'anthropic';
  if (normalized === 'xai') return 'xai';
  if (normalized === 'ollama') return 'ollama';
  return null;
}

function looksCredentialLike(value: string): boolean {
  return /(API_KEY|TOKEN|SECRET|PASSWORD|CLIENT_ID|CLIENT_SECRET|OAUTH)/.test(value);
}

function looksSensitive(value: string): boolean {
  return /(API_KEY|TOKEN|SECRET|PASSWORD|CLIENT_SECRET|OAUTH)/.test(value);
}

function toTitleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeEnvToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'CUSTOM';
}

function isStale(iso: string, maxAgeMs: number): boolean {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) {
    return true;
  }
  return Date.now() - ts > maxAgeMs;
}

function* walkFiles(dir: string): Generator<string> {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
      continue;
    }
    if (entry.isFile()) {
      yield fullPath;
    }
  }
}

function resolveCategoryChoice(choice: string): CredentialCategory | null {
  const normalized = choice.trim().toLowerCase();
  if (normalized.startsWith('providers')) return 'provider';
  if (normalized.startsWith('tools')) return 'tool';
  if (normalized.startsWith('channels')) return 'channel';
  if (normalized.startsWith('services')) return 'service';
  return null;
}

function normalizeAllowedCategories(input?: CredentialCategory[]): CredentialCategory[] {
  const source = Array.isArray(input) && input.length > 0
    ? input
    : DEFAULT_CREDENTIAL_CATEGORIES;
  const out: CredentialCategory[] = [];
  for (const category of source) {
    if (!DEFAULT_CREDENTIAL_CATEGORIES.includes(category)) {
      continue;
    }
    if (!out.includes(category)) {
      out.push(category);
    }
  }
  return out.length > 0 ? out : DEFAULT_CREDENTIAL_CATEGORIES;
}

function categoryMenuLabel(category: CredentialCategory, count: number): string {
  if (category === 'provider') return `Providers (${count})`;
  if (category === 'tool') return `Tools (${count})`;
  if (category === 'channel') return `Channels (${count})`;
  return `Services (${count})`;
}

async function requestText(url: string, timeoutMs: number = 10000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while requesting ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function promptInput(message: string, initial?: string): Promise<string> {
  const response: { value: string } = await enquirer.prompt({
    type: 'input',
    name: 'value',
    message,
    initial,
  });
  return response.value ?? '';
}

async function promptSecret(message: string): Promise<string> {
  const response: { value: string } = await enquirer.prompt({
    type: 'password',
    name: 'value',
    message,
  } as never);
  return response.value ?? '';
}

async function promptSelect(message: string, choices: string[], initial: number = 0): Promise<string> {
  const response: { value: string } = await enquirer.prompt({
    type: 'select',
    name: 'value',
    message,
    choices,
    initial,
  } as never);
  return response.value;
}

async function promptMultiSelectWithFallback(message: string, choices: string[]): Promise<string[]> {
  if (choices.length === 0) {
    return [];
  }
  return await fallbackTogglePicker(
    `${message} (Enter toggles, Done continues)`,
    choices
  );
}

async function fallbackTogglePicker(message: string, choices: string[]): Promise<string[]> {
  const selected = new Set<string>();
  while (true) {
    const display = choices.map((choice) => `${selected.has(choice) ? '[x]' : '[ ]'} ${choice}`);
    display.push('Done');
    const pick = await promptSelect(message, display, 0);
    if (pick === 'Done') {
      break;
    }
    const raw = pick.slice(4);
    if (selected.has(raw)) {
      selected.delete(raw);
    } else {
      selected.add(raw);
    }
  }
  return Array.from(selected);
}
