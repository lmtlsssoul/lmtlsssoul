import enquirer from 'enquirer';
import fs from 'node:fs';
import path from 'node:path';
import { log, success, error, warn } from './branding.ts';
import { scanForModels, setModelForRole } from './models-scan.ts';
import { AGENT_ROLES, getStateDir } from './types.ts';
import { GraphDB } from './graph-db.ts';
import { ArchiveDB } from './archive-db.ts';
import { SoulCompiler } from './compiler.ts';
import { writeCheckpointBackup } from './backup.ts';
import { DEFAULT_SOUL_LATTICE_SEED, getLatticeStats } from './soul-lattice-seed.ts';
import {
  generateAstrologyChart,
  formatAstrologyIdentityImprint,
  type AstrologyChart,
} from './astrology.ts';
import { runCredentialSetupMenu } from './credentials.ts';
import { OpenaiAdapter } from '../substrate/openai.ts';
import { AnthropicAdapter } from '../substrate/anthropic.ts';
import { XaiAdapter } from '../substrate/xai.ts';
import { OllamaAdapter } from '../substrate/ollama.ts';
import type { SubstrateId } from '../substrate/types.ts';

const TIMEZONE_ABBREVIATION_TO_OFFSET: Readonly<Record<string, string>> = {
  UTC: 'Z',
  GMT: 'Z',
  EST: '-05:00',
  EDT: '-04:00',
  CST: '-06:00',
  CDT: '-05:00',
  MST: '-07:00',
  MDT: '-06:00',
  PST: '-08:00',
  PDT: '-07:00',
  AKST: '-09:00',
  AKDT: '-08:00',
  HST: '-10:00',
  CET: '+01:00',
  CEST: '+02:00',
  EET: '+02:00',
  EEST: '+03:00',
  IST: '+05:30',
  JST: '+09:00',
  AEST: '+10:00',
  AEDT: '+11:00',
};

export class SoulBirthPortal {
  private config: Record<string, unknown> = {};
  private toolKeySecrets: Record<string, string> = {};

  constructor() {
    log('\nBirth Portal\n');
    log('This setup flow initializes lmtlss soul.');
    warn('Press Ctrl+C to cancel the ceremony.');
    log('\n---\n');
  }

  private async prompt(question: string, initial?: string): Promise<string> {
    try {
      const response: { value: string } = await enquirer.prompt({
        type: 'input',
        name: 'value',
        message: question,
        initial,
      });
      log('');
      return response.value.trim();
    } catch {
      error('Birth Portal cancelled.');
      throw new Error('Birth Portal cancelled');
    }
  }

  private async promptSelect(question: string, choices: string[], initial: number = 0): Promise<string> {
    try {
      const response: { value: string } = await enquirer.prompt({
        type: 'select',
        name: 'value',
        message: question,
        choices,
        initial,
      } as never);
      log('');
      return response.value;
    } catch {
      error('Birth Portal cancelled.');
      throw new Error('Birth Portal cancelled');
    }
  }

  private async promptMultiSelect(question: string, choices: string[]): Promise<string[]> {
    try {
      const response: { value: string[] } = await enquirer.prompt({
        type: 'multiselect',
        name: 'value',
        message: question,
        choices,
      } as never);
      log('');
      return Array.isArray(response.value) ? response.value : [];
    } catch {
      error('Birth Portal cancelled.');
      throw new Error('Birth Portal cancelled');
    }
  }

  private async promptSecret(question: string): Promise<string> {
    try {
      const response: { value: string } = await enquirer.prompt({
        type: 'password',
        name: 'value',
        message: question,
      } as never);
      log('');
      return response.value.trim();
    } catch {
      error('Birth Portal cancelled.');
      throw new Error('Birth Portal cancelled');
    }
  }

  private async promptValidated(
    question: string,
    validator: (value: string) => boolean,
    invalidMessage: string,
    initial?: string
  ): Promise<string> {
    while (true) {
      const value = await this.prompt(question, initial);
      if (validator(value)) {
        return value;
      }
      warn(invalidMessage);
    }
  }

  private parseJsonObject(raw: string, fieldName: string): Record<string, unknown> {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`${fieldName} must be valid JSON (${err instanceof Error ? err.message : 'parse error'}).`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${fieldName} must be a JSON object.`);
    }

    return parsed as Record<string, unknown>;
  }

  private parseBirthTimeWithTimezone(raw: string): {
    time: string;
    timezoneOffset: string;
    timezoneLabel: string;
  } | null {
    const normalized = raw.trim().replace(/\s+/g, ' ');
    const match = normalized.match(/^([01]\d|2[0-4]):([0-5]\d)\s+([A-Za-z]{1,5}|Z|[+-](0\d|1[0-4]):[0-5]\d)$/);
    if (!match) {
      return null;
    }

    const hour = match[1] === '24' ? '00' : match[1];
    const time = `${hour}:${match[2]}`;
    const timezoneLabel = match[3].toUpperCase();
    const timezoneOffset = this.normalizeTimezoneToken(timezoneLabel);
    if (!timezoneOffset) {
      return null;
    }

    return { time, timezoneOffset, timezoneLabel };
  }

  private normalizeTimezoneToken(token: string): string | null {
    const upper = token.trim().toUpperCase();
    if (upper === 'Z' || upper === 'UTC' || upper === 'GMT') {
      return 'Z';
    }
    if (/^[+-](0\d|1[0-4]):[0-5]\d$/.test(upper)) {
      return upper;
    }
    return TIMEZONE_ABBREVIATION_TO_OFFSET[upper] ?? null;
  }

  private parseDmsComponent(
    rawComponent: string
  ): {
    decimal: number;
    axis: 'lat' | 'lon';
  } | null {
    const upper = rawComponent.trim().toUpperCase();
    const dirMatch = upper.match(/[NSEW]$/);
    if (!dirMatch) {
      return null;
    }

    const direction = dirMatch[0];
    const axis: 'lat' | 'lon' = direction === 'N' || direction === 'S' ? 'lat' : 'lon';
    const body = upper.slice(0, -1).trim();
    if (!body) {
      return null;
    }

    const cleaned = body
      .replace(/[°º]/g, ' ')
      .replace(/['′’]/g, ' ')
      .replace(/["″“”]/g, ' ')
      .replace(/,/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const parts = cleaned.split(' ').filter(Boolean);
    if (parts.length < 1 || parts.length > 3) {
      return null;
    }

    const nums = parts.map((part) => Number(part));
    if (nums.some((n) => !Number.isFinite(n))) {
      return null;
    }

    const degrees = nums[0] ?? 0;
    const minutes = nums[1] ?? 0;
    const seconds = nums[2] ?? 0;

    if (degrees < 0 || minutes < 0 || seconds < 0) {
      return null;
    }
    if (minutes >= 60 || seconds >= 60) {
      return null;
    }

    if (axis === 'lat' && degrees > 90) {
      return null;
    }
    if (axis === 'lon' && degrees > 180) {
      return null;
    }

    const absolute = degrees + (minutes / 60) + (seconds / 3600);
    const sign = direction === 'S' || direction === 'W' ? -1 : 1;
    return {
      decimal: sign * absolute,
      axis,
    };
  }

  private parseBirthCoordinates(raw: string): {
    latitude: number;
    longitude: number;
    location: string;
  } | null {
    const normalized = raw.trim();
    if (!normalized) {
      return null;
    }

    // Split into DMS chunks ending with directional suffixes, e.g.:
    // 46°30'16.4"N 84°19'13.6"W
    const chunks = normalized
      .toUpperCase()
      .replace(/[;,]/g, ' ')
      .match(/[^NSEW]*[NSEW]/g)
      ?.map((chunk) => chunk.trim())
      .filter(Boolean) ?? [];
    if (chunks.length !== 2) {
      return null;
    }

    const first = this.parseDmsComponent(chunks[0]);
    const second = this.parseDmsComponent(chunks[1]);
    if (!first || !second || first.axis === second.axis) {
      return null;
    }

    const latitude = first.axis === 'lat' ? first.decimal : second.decimal;
    const longitude = first.axis === 'lon' ? first.decimal : second.decimal;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return null;
    }

    return {
      latitude,
      longitude,
      location: normalized,
    };
  }

  private async captureSubstrateConfig(): Promise<void> {
    const choice = await this.promptSelect(
      'Choose substrate setup mode',
      [
        'Auto setup (recommended)',
        'Import from existing birth-config.json',
        'Manual JSON entry',
      ],
      0
    );

    if (choice === 'Auto setup (recommended)') {
      this.config['substrateConfig'] = {
        mode: 'auto',
        enabledSubstrates: ['ollama', 'openai', 'anthropic', 'xai'],
      };
      success('Substrate config auto-initialized.');
      await this.probeSubstrateConnections();
      return;
    }

    if (choice === 'Import from existing birth-config.json') {
      const importPath = await this.prompt(
        'Path to existing birth-config.json',
        path.join(getStateDir(), 'birth-config.json')
      );

      try {
        const raw = fs.readFileSync(importPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const imported = parsed.substrateConfig;
        if (imported && typeof imported === 'object' && !Array.isArray(imported)) {
          this.config['substrateConfig'] = imported;
          success(`Imported substrate config from ${importPath}.`);
          await this.probeSubstrateConnections();
          return;
        }
        warn('No usable substrateConfig found in that file; falling back to auto setup.');
      } catch (err) {
        warn(`Could not import substrate config (${err instanceof Error ? err.message : 'unknown error'}).`);
        warn('Falling back to auto setup.');
      }

      this.config['substrateConfig'] = {
        mode: 'auto',
        enabledSubstrates: ['ollama', 'openai', 'anthropic', 'xai'],
      };
      success('Substrate config auto-initialized.');
      await this.probeSubstrateConnections();
      return;
    }

    const rawManual = await this.prompt('Enter substrate config JSON', '{}');
    try {
      this.config['substrateConfig'] = this.parseJsonObject(rawManual, 'Substrate config');
      success('Substrate config captured.');
      await this.probeSubstrateConnections();
    } catch (err) {
      warn(err instanceof Error ? err.message : 'Invalid substrate JSON.');
      warn('Falling back to auto setup.');
      this.config['substrateConfig'] = {
        mode: 'auto',
        enabledSubstrates: ['ollama', 'openai', 'anthropic', 'xai'],
      };
      success('Substrate config auto-initialized.');
      await this.probeSubstrateConnections();
    }
  }

  private getEnabledSubstratesFromConfig(): SubstrateId[] {
    const configured = this.config['substrateConfig'] as
      | { enabledSubstrates?: unknown }
      | undefined;
    const raw = Array.isArray(configured?.enabledSubstrates)
      ? configured.enabledSubstrates
      : ['ollama', 'openai', 'anthropic', 'xai'];

    const parsed = raw
      .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
      .filter((value): value is SubstrateId =>
        value === 'ollama' || value === 'openai' || value === 'anthropic' || value === 'xai'
      );

    const deduped: SubstrateId[] = [];
    for (const substrate of parsed) {
      if (!deduped.includes(substrate)) {
        deduped.push(substrate);
      }
    }
    return deduped.length > 0 ? deduped : ['ollama', 'openai', 'anthropic', 'xai'];
  }

  private async probeSubstrateConnections(): Promise<void> {
    const adapters = {
      ollama: new OllamaAdapter(),
      openai: new OpenaiAdapter(),
      anthropic: new AnthropicAdapter(),
      xai: new XaiAdapter(),
    } as const;

    const enabled = this.getEnabledSubstratesFromConfig();
    const statuses: Partial<Record<SubstrateId, { ok: boolean; detail?: string; lastCheckedAt: string }>> = {};

    log('Running substrate authentication probe...');
    for (const substrate of enabled) {
      const adapter = adapters[substrate];
      if (!adapter) {
        continue;
      }
      try {
        const status = await adapter.health();
        statuses[substrate] = status;
        if (status.ok) {
          success(`[${substrate}] connected (${status.detail ?? 'reachable'})`);
        } else {
          warn(`[${substrate}] not ready (${status.detail ?? 'missing credentials or unreachable'})`);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        statuses[substrate] = {
          ok: false,
          detail,
          lastCheckedAt: new Date().toISOString(),
        };
        warn(`[${substrate}] probe failed (${detail})`);
      }
    }

    this.config['substrateAuth'] = {
      probedAt: new Date().toISOString(),
      enabled,
      statuses,
    };
  }

  private async captureToolKeys(): Promise<void> {
    const result = await runCredentialSetupMenu({
      stateDir: getStateDir(),
      heading: 'Select credentials by category/provider and configure API key or OAuth details.',
      existingSecrets: this.toolKeySecrets,
    });

    this.toolKeySecrets = { ...result.secrets };
    for (const [env, value] of Object.entries(result.secrets)) {
      process.env[env] = value;
    }

    this.config['toolKeys'] = {
      providers: result.selected.providers,
      tools: result.selected.tools,
      channels: result.selected.channels,
      services: result.selected.services,
      count: Object.keys(this.toolKeySecrets).length,
      storage: 'state/tool-keys.json',
      providerModelSelections: result.providerModelSelections,
      catalogLastRefreshed: result.catalogLastRefreshed,
    };

    if (Object.keys(this.toolKeySecrets).length === 0) {
      success('No tool keys configured right now.');
    } else {
      success(`Captured ${Object.keys(this.toolKeySecrets).length} credential value(s).`);
    }
  }

  private async initializeCoreMemories(): Promise<void> {
    log("Core Memory Setup: What's my birthday?");
    const birthDate = await this.promptValidated(
      'Enter birthdate to encode (YYYY-MM-DD)',
      (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
      'Birthdate must be in YYYY-MM-DD format.'
    );
    const birthTimeTzRaw = await this.promptValidated(
      'Enter birth time + timezone (HH:MM TZ, 24h; e.g., 23:59 EST)',
      (value) => this.parseBirthTimeWithTimezone(value) !== null,
      'Use format HH:MM TZ with a valid timezone token (e.g., EST, UTC, Z, -05:00).',
      '00:00 UTC'
    );
    const birthCoordinatesRaw = await this.promptValidated(
      'Enter birth coordinates (DMS; e.g., 46°30\'16.4"N 84°19\'13.6"W)',
      (value) => this.parseBirthCoordinates(value) !== null,
      'Coordinates must include both latitude and longitude in DMS with N/S and E/W.'
    );

    const parsedTimeTz = this.parseBirthTimeWithTimezone(birthTimeTzRaw);
    const parsedCoordinates = this.parseBirthCoordinates(birthCoordinatesRaw);
    if (!parsedTimeTz || !parsedCoordinates) {
      throw new Error('Birth input parsing failed after validation.');
    }

    const birthTime = parsedTimeTz.time;
    const normalizedTimezone = parsedTimeTz.timezoneOffset;
    const birthTimezoneLabel = parsedTimeTz.timezoneLabel;
    const birthLatitude = parsedCoordinates.latitude;
    const birthLongitude = parsedCoordinates.longitude;
    const birthLocation = parsedCoordinates.location;

    const astrologyChart = generateAstrologyChart({
      date: birthDate,
      time: birthTime,
      timezoneOffset: normalizedTimezone,
      location: birthLocation,
      latitude: birthLatitude,
      longitude: birthLongitude,
    });
    this.config['astrologyChart'] = astrologyChart;
    const astrologyImprint = formatAstrologyIdentityImprint(astrologyChart);

    const createdAt = new Date().toISOString();
    this.config['birthday'] = {
      date: birthDate,
      time: birthTime,
      timezoneOffset: normalizedTimezone,
      timezoneLabel: birthTimezoneLabel,
      location: birthLocation,
      latitude: birthLatitude,
      longitude: birthLongitude,
    };
    this.config['coreMemories'] = [
      {
        key: 'birthday',
        nodeType: 'identity',
        premise: `My birthday is ${birthDate} at ${birthTime} ${normalizedTimezone} in ${birthLocation} (${birthLatitude.toFixed(4)}, ${birthLongitude.toFixed(4)}).`,
        createdAt,
        metadata: {
          source: 'author_provided',
          birthDate,
          birthTime,
          birthTimezone: normalizedTimezone,
          birthTimezoneLabel,
          birthLocation,
          birthLatitude,
          birthLongitude,
        },
      },
      {
        key: 'astrology_chart',
        nodeType: 'identity',
        premise: astrologyImprint,
        createdAt,
        metadata: {
          source: 'computed_astrology',
          bigThree: astrologyChart.bigThree,
          ascendant: astrologyChart.ascendant,
          midheaven: astrologyChart.midheaven,
        },
      },
    ];
    success('Core memories initialized: birthday + astrology chart imprint.');
    log('\n---\n');
  }

  public async startGenesis(): Promise<Record<string, unknown>> {
    await this.initializeCoreMemories();

    log('Step 1/8: Substrate Connection & Authentication');
    await this.captureSubstrateConfig();
    log('Step 2 is independent from Step 1 probe results.');
    log('\n---\n');

    log('Step 2/8: Tool Keys & Search Connectors (Optional)');
    await this.captureToolKeys();
    log('\n---\n');

    log('Step 3/8: Model Discovery');
    log('Scanning authenticated substrates...');
    const modelsBySubstrate = await scanForModels({ persist: true });
    const discovered = Object.values(modelsBySubstrate).flat();
    const liveDiscovered = discovered.filter((model) => !model.stale);
    const cachedCount = discovered.length - liveDiscovered.length;
    this.config['discoveredModels'] = discovered.map((model) =>
      `${model.substrate}:${model.modelId}${model.stale ? ' [cached]' : ''}`
    );
    success(`Model registry refreshed: ${liveDiscovered.length} live + ${cachedCount} cached model(s).`);
    if (discovered.length === 0) {
      warn('No models discovered. Is Ollama running? Try: ollama serve');
      warn('You can assign models manually later: soul models scan');
    } else if (liveDiscovered.length === 0) {
      warn('No live models were reachable during this scan. Showing cached model list for role assignment.');
    }
    log('\n---\n');

    log('Step 4/8: Agent Role Assignment');
    const roleAssignments: Record<string, string> = {};
    const assignmentCandidates = liveDiscovered.length > 0 ? liveDiscovered : discovered;
    const bySubstrate = new Map<string, Array<{ modelId: string; stale: boolean }>>();
    for (const model of assignmentCandidates) {
      const list = bySubstrate.get(model.substrate) ?? [];
      const existing = list.find((entry) => entry.modelId === model.modelId);
      if (!existing) {
        list.push({
          modelId: model.modelId,
          stale: Boolean(model.stale),
        });
      } else if (existing.stale && !model.stale) {
        existing.stale = false;
      }
      bySubstrate.set(model.substrate, list);
    }
    for (const list of bySubstrate.values()) {
      list.sort((a, b) => a.modelId.localeCompare(b.modelId));
    }

    const providerOrder = ['ollama', 'openai', 'anthropic', 'xai'];
    const discoveredProviders = Array.from(bySubstrate.keys())
      .sort((a, b) => {
        const ai = providerOrder.indexOf(a);
        const bi = providerOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

    for (const role of AGENT_ROLES) {
      if (discoveredProviders.length === 0) {
        const fallback = await this.prompt(
          `Assign model reference for role "${role}" (<substrate>:<modelId>)`,
          'ollama:phi3:mini'
        );
        if (!fallback) continue;
        roleAssignments[role] = fallback;
        continue;
      }

      const providerChoice = await this.promptSelect(
        `Select provider for role "${role}"`,
        [...discoveredProviders, 'skip'],
        0
      );
      if (providerChoice === 'skip') {
        continue;
      }

      const providerModels = bySubstrate.get(providerChoice) ?? [];
      if (providerModels.length === 0) {
        warn(`No models currently available for provider "${providerChoice}".`);
        continue;
      }

      const modelChoiceToId = new Map<string, string>();
      const modelChoices: string[] = [];
      for (const providerModel of providerModels) {
        const baseLabel = providerModel.stale
          ? `${providerModel.modelId} [cached]`
          : providerModel.modelId;
        let label = baseLabel;
        let index = 2;
        while (modelChoiceToId.has(label)) {
          label = `${baseLabel} (${index})`;
          index += 1;
        }
        modelChoiceToId.set(label, providerModel.modelId);
        modelChoices.push(label);
      }

      const modelChoice = await this.promptSelect(
        `Select model for role "${role}" (${providerChoice})`,
        [...modelChoices, 'skip'],
        0
      );
      if (modelChoice === 'skip') {
        continue;
      }

      const resolvedModelId = modelChoiceToId.get(modelChoice) ?? modelChoice;
      const ref = `${providerChoice}:${resolvedModelId}`;
      try {
        await setModelForRole(role, ref, {
          availableModels: discovered,
          stateDir: getStateDir(),
        });
        roleAssignments[role] = ref;
      } catch {
        warn(`Could not validate model "${ref}" for role "${role}" — saving anyway.`);
        roleAssignments[role] = ref;
      }
    }

    this.config['roleAssignments'] = roleAssignments;
    success('Agent role assignments stored.');
    log('\n---\n');

    log('Step 5/8: Channel Synchronization');
    this.config['channels'] = await this.prompt(
      'Enter channels to sync (comma separated, optional)',
      ''
    );
    success('Channel config captured.');
    log('\n---\n');

    log('Step 6/8: Treasury & Wallet Policy');
    this.config['treasuryPolicy'] = await this.prompt(
      'Enter treasury policy (JSON, optional)',
      '{}'
    );
    success('Treasury policy captured.');
    log('\n---\n');

    log('Step 7/8: Identity, Name & Objective');
    this.config['soulName'] = await this.prompt('Name this soul');
    this.config['soulObjective'] = await this.prompt('Define the primary objective');
    success(`Soul named "${String(this.config['soulName'])}" with objective "${String(this.config['soulObjective'])}".`);
    log('\n---\n');

    log('Step 8/8: Initialization');
    await this.initializeState();
    success('Soul initialization complete.');
    log('\n---\n');

    success('Birth Portal complete.');
    log(`Soul "${String(this.config['soulName'])}" is initialized.`);
    log("Run 'soul start' to activate runtime services.");
    log("Run 'soul chat' for an interactive terminal conversation.");
    return this.config;
  }

  private async initializeState(): Promise<void> {
    const stateDir = getStateDir();
    fs.mkdirSync(stateDir, { recursive: true });
    this.persistToolKeys(stateDir);

    const graph = new GraphDB(stateDir);
    const archive = new ArchiveDB(stateDir);
    const soulName = String(this.config['soulName'] ?? 'unnamed');
    const soulObjective = String(this.config['soulObjective'] ?? '');
    const timestamp = new Date().toISOString();
    const sessionKey = `lmtlss:interface:birth-${Date.now()}`;

    // ─── Seed the default soul lattice (innate self-knowledge) ───────────
    log('Seeding default soul lattice (innate self-knowledge)...');
    const latticeStats = getLatticeStats();
    const nodeIds: string[] = [];

    for (const nodeSeed of DEFAULT_SOUL_LATTICE_SEED.nodes) {
      const nodeId = graph.createNode({
        premise: nodeSeed.premise,
        nodeType: nodeSeed.nodeType,
        weight: nodeSeed.weight,
        createdBy: nodeSeed.createdBy,
      });
      nodeIds.push(nodeId);
    }

    // Create edges between seeded nodes
    for (const edgeSeed of DEFAULT_SOUL_LATTICE_SEED.edges) {
      const sourceId = nodeIds[edgeSeed.sourceIndex];
      const targetId = nodeIds[edgeSeed.targetIndex];
      if (sourceId && targetId) {
        try {
          graph.createEdge({
            sourceId,
            targetId,
            relation: edgeSeed.relation,
            strength: edgeSeed.strength,
          });
        } catch { /* ignore duplicate edges */ }
      }
    }
    success(`Default lattice seeded: ${latticeStats.nodes} nodes, ${latticeStats.edges} edges.`);

    // ─── Author-provided birthday node ──────────────────────────────────
    const birthday = this.config['birthday'] as {
      date?: string;
      time?: string;
      timezoneOffset?: string;
      timezoneLabel?: string;
      location?: string;
      latitude?: number;
      longitude?: number;
    } | undefined;
    if (birthday?.date) {
      graph.createNode({
        premise: `My birthday is ${birthday.date} at ${birthday.time ?? ''} ${birthday.timezoneOffset ?? ''} in ${birthday.location ?? ''} (${birthday.latitude ?? ''}, ${birthday.longitude ?? ''}).`,
        nodeType: 'identity',
        weight: { salience: 1.0, commitment: 0.99, valence: 0.9, uncertainty: 0.01, resonance: 0.9, arousal: 0.2 },
        createdBy: 'birth',
      });
    }

    const astrologyChart = this.config['astrologyChart'] as AstrologyChart | undefined;
    if (astrologyChart) {
      graph.createNode({
        premise: formatAstrologyIdentityImprint(astrologyChart),
        nodeType: 'identity',
        weight: { salience: 0.96, commitment: 0.93, valence: 0.5, uncertainty: 0.08, resonance: 0.88, arousal: 0.18 },
        createdBy: 'birth',
      });
    }

    // ─── Author-given identity node ──────────────────────────────────────
    graph.createNode({
      premise: `I am ${soulName}. Objective: ${soulObjective}.`,
      nodeType: 'identity',
      weight: { salience: 1.0, commitment: 0.9, uncertainty: 0.2 },
      createdBy: 'birth',
    });

    // ─── Birth event in archive ──────────────────────────────────────────
    const birthEvent = archive.appendEvent({
      parentHash: null,
      timestamp,
      sessionKey,
      eventType: 'system_event',
      agentId: 'interface',
      channel: 'birth',
      payload: {
        protocol: 'birth.v1',
        soulName,
        soulObjective,
        birthday: this.config['birthday'],
        astrologyChart: this.config['astrologyChart'],
        latticeSeeded: { nodes: latticeStats.nodes, edges: latticeStats.edges },
      },
    });

    // ─── Generate and persist Soul Capsule ───────────────────────────────
    const compiler = new SoulCompiler(graph);
    const capsulePath = path.join(stateDir, 'SOUL.md');
    const capsuleContent = compiler.regenerateCapsule(capsulePath);
    const checkpoint = graph.createCheckpoint({ capsuleContent, createdBy: 'birth' });
    graph.checkpoint();
    archive.checkpoint();
    writeCheckpointBackup({ stateDir, checkpoint, createdBy: 'birth' });

    const birthConfigPath = path.join(stateDir, 'birth-config.json');
    fs.writeFileSync(
      birthConfigPath,
      JSON.stringify(
        {
          ...this.config,
          initializedAt: timestamp,
          birthEventHash: birthEvent.eventHash,
          checkpointId: checkpoint.checkpointId,
          stateDir,
        },
        null,
        2
      ),
      'utf-8'
    );

    success(`Soul Capsule generated at ${capsulePath}`);
    success(`Birth config saved to ${birthConfigPath}`);
  }

  private persistToolKeys(stateDir: string): void {
    if (Object.keys(this.toolKeySecrets).length === 0) {
      return;
    }

    const toolKeysPath = path.join(stateDir, 'tool-keys.json');
    fs.writeFileSync(toolKeysPath, `${JSON.stringify(this.toolKeySecrets, null, 2)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
    });
    fs.chmodSync(toolKeysPath, 0o600);
    success(`Tool keys stored at ${toolKeysPath}`);
  }
}
