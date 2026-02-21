import enquirer from 'enquirer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
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
import {
  runCredentialSetupMenu,
  runProviderCredentialSetupMenu,
  type CredentialSetupResult,
} from './credentials.ts';
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

const AUTO_DEFAULT_OLLAMA_MODEL_ID = 'silk/eidolon-1.0:0.5b';
const AUTO_DEFAULT_OLLAMA_MODEL_REF = `ollama:${AUTO_DEFAULT_OLLAMA_MODEL_ID}`;

const ANSI_GREEN = '\u001b[32m';
const ANSI_RED = '\u001b[31m';
const ANSI_WHITE = '\u001b[37m';
const ANSI_RESET = '\u001b[39m';

function colorize(code: string, value: string): string {
  return `${code}${value}${ANSI_RESET}`;
}

const ENQUIRER_THEME = {
  pointer: {
    on: colorize(ANSI_RED, '▸'),
    off: ' ',
  },
  styles: {
    primary: (value: string) => colorize(ANSI_GREEN, value),
    em: (value: string) => colorize(ANSI_RED, value),
    placeholder: (value: string) => colorize(ANSI_WHITE, value),
    success: (value: string) => colorize(ANSI_GREEN, value),
    danger: (value: string) => colorize(ANSI_RED, value),
    warning: (value: string) => colorize(ANSI_RED, value),
    strong: (value: string) => colorize(ANSI_WHITE, value),
    muted: (value: string) => colorize(ANSI_WHITE, value),
    disabled: (value: string) => colorize(ANSI_WHITE, value),
    dark: (value: string) => colorize(ANSI_WHITE, value),
    pending: (value: string) => colorize(ANSI_GREEN, value),
    submitted: (value: string) => colorize(ANSI_GREEN, value),
    cancelled: (value: string) => colorize(ANSI_RED, value),
  },
} as const;

export class SoulBirthPortal {
  private config: Record<string, unknown> = {};
  private toolKeySecrets: Record<string, string> = {};
  private substrateSetupMode: 'auto' | 'manual' = 'auto';
  private autoAssignedModelRef: string | null = null;
  private preloadedAutoBootstrap: Promise<Record<string, unknown>> | null = null;
  private resolvedAutoBootstrap: Record<string, unknown> | null = null;

  constructor(options?: {
    silent?: boolean;
    preloadedAutoBootstrap?: Promise<Record<string, unknown>> | null;
  }) {
    this.preloadedAutoBootstrap = options?.preloadedAutoBootstrap ?? null;
    if (!options?.silent) {
      log('Birth Portal');
      log('This setup flow initializes lmtlss soul.');
      warn('Press Ctrl+C to cancel the ceremony.');
      log('---');
    }
  }

  public static startAutoBootstrapTask(): Promise<Record<string, unknown>> {
    const worker = new SoulBirthPortal({ silent: true });
    return worker.bootstrapAutoLocalModel();
  }

  private async prompt(question: string, initial?: string): Promise<string> {
    try {
      const response: { value: string } = await enquirer.prompt({
        type: 'input',
        name: 'value',
        message: question,
        initial,
        ...ENQUIRER_THEME,
      } as never);
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
        ...ENQUIRER_THEME,
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
        ...ENQUIRER_THEME,
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
        type: 'input',
        name: 'value',
        message: question,
        ...ENQUIRER_THEME,
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
      'Choose Substrata',
      [
        'Eidolon (recommended)',
        'Manual provider/model setup',
      ],
      0
    );

    if (choice === 'Eidolon (recommended)') {
      this.substrateSetupMode = 'auto';
      this.config['substrateConfig'] = await this.buildAutoSubstrateConfig();
      this.config['substrateSetupMode'] = 'auto';
      const bootstrap = await this.resolveAutoBootstrap();
      this.config['autoBootstrap'] = bootstrap;
      if (bootstrap.ready) {
        this.autoAssignedModelRef = AUTO_DEFAULT_OLLAMA_MODEL_REF;
        this.config['providerAuthSetup'] = {
          providers: ['ollama'],
          providerModelSelections: { ollama: [AUTO_DEFAULT_OLLAMA_MODEL_ID] },
          mode: 'eidolon_default_local',
          count: Object.keys(this.toolKeySecrets).length,
          catalogLastRefreshed: new Date().toISOString(),
        };
      }
      success('Mind substrata initialized via Eidolon profile.');
      return;
    }

    if (choice === 'Manual provider/model setup') {
      this.substrateSetupMode = 'manual';
      const selected = await this.promptSubstrateSelection(
        ['ollama', 'openai', 'anthropic', 'xai']
      );
      this.config['substrateConfig'] = {
        mode: 'manual',
        enabledSubstrates: selected,
      };
      this.config['substrateSetupMode'] = 'manual';
      this.autoAssignedModelRef = null;
      success(`Substrata config captured (${selected.join(', ')}).`);
      return;
    }
    warn('Unknown setup selection. Falling back to Eidolon.');
    this.substrateSetupMode = 'auto';
    this.config['substrateConfig'] = await this.buildAutoSubstrateConfig();
    this.config['substrateSetupMode'] = 'auto';
    success('Mind substrata initialized via Eidolon profile.');
  }

  private buildAutoEnabledSubstrates(): SubstrateId[] {
    return ['ollama'];
  }

  private async promptSubstrateSelection(defaults: SubstrateId[]): Promise<SubstrateId[]> {
    const all: SubstrateId[] = ['ollama', 'openai', 'anthropic', 'xai'];
    const selected = new Set<SubstrateId>(defaults);

    while (true) {
      const choices = all.map((substrate) => `${selected.has(substrate) ? '[x]' : '[ ]'} ${substrate}`);
      choices.push('Done');
      const pick = await this.promptSelect(
        'Select enabled substrata (toggle entries, then Done)',
        choices,
        0
      );

      if (pick === 'Done') {
        break;
      }

      const substrate = pick.slice(4).trim().toLowerCase() as SubstrateId;
      if (!all.includes(substrate)) {
        continue;
      }
      if (selected.has(substrate)) {
        selected.delete(substrate);
      } else {
        selected.add(substrate);
      }
    }

    const out = all.filter((substrate) => selected.has(substrate));
    if (out.length > 0) {
      return out;
    }

    warn('No substrata selected. Defaulting to ollama.');
    return ['ollama'];
  }

  private async buildAutoSubstrateConfig(): Promise<Record<string, unknown>> {
    return {
      mode: 'auto',
      enabledSubstrates: this.buildAutoEnabledSubstrates(),
      autoDetection: await this.detectRuntimeContext(),
    };
  }

  private async resolveAutoBootstrap(): Promise<Record<string, unknown>> {
    if (this.resolvedAutoBootstrap) {
      return this.resolvedAutoBootstrap;
    }
    if (this.preloadedAutoBootstrap) {
      try {
        const resolved = await this.preloadedAutoBootstrap;
        this.resolvedAutoBootstrap = resolved;
        return resolved;
      } catch (err) {
        warn(`Preloaded auto bootstrap failed (${err instanceof Error ? err.message : String(err)}). Retrying inline...`);
      }
    }
    const inline = await this.bootstrapAutoLocalModel();
    this.resolvedAutoBootstrap = inline;
    return inline;
  }

  private async bootstrapAutoLocalModel(): Promise<Record<string, unknown>> {
    const report: Record<string, unknown> = {
      mode: 'eidolon_auto_bootstrap',
      modelId: AUTO_DEFAULT_OLLAMA_MODEL_ID,
      modelRef: AUTO_DEFAULT_OLLAMA_MODEL_REF,
      startedAt: new Date().toISOString(),
      ollamaInstalled: false,
      runtimeReachable: false,
      modelReady: false,
    };

    let hasOllama = this.commandExists('ollama');
    if (!hasOllama) {
      log('Ollama not detected. Attempting automatic install...');
      const installed = await this.installOllamaRuntime();
      report['installAttempted'] = true;
      report['installSucceeded'] = installed;
      hasOllama = installed && this.commandExists('ollama');
    }

    report['ollamaInstalled'] = hasOllama;
    if (!hasOllama) {
      warn('Ollama is not available. Auto bootstrap could not complete.');
      report['ready'] = false;
      report['completedAt'] = new Date().toISOString();
      return report;
    }

    const runtimeReachable = await this.ensureOllamaRuntimeReachable();
    report['runtimeReachable'] = runtimeReachable;
    if (!runtimeReachable) {
      warn('Ollama runtime did not become reachable. Auto bootstrap stopped before model pull.');
      report['ready'] = false;
      report['completedAt'] = new Date().toISOString();
      return report;
    }

    let models = await this.listOllamaModelIds();
    let modelReady = models.includes(AUTO_DEFAULT_OLLAMA_MODEL_ID);
    if (!modelReady) {
      log(`Pulling default local model "${AUTO_DEFAULT_OLLAMA_MODEL_ID}"...`);
      const pulled = await this.runStreamingCommand('ollama', ['pull', AUTO_DEFAULT_OLLAMA_MODEL_ID], 30 * 60 * 1000);
      report['pullAttempted'] = true;
      report['pullSucceeded'] = pulled;
      models = await this.listOllamaModelIds();
      modelReady = models.includes(AUTO_DEFAULT_OLLAMA_MODEL_ID);
    }

    report['modelReady'] = modelReady;
    report['ready'] = modelReady;
    report['availableModelCount'] = models.length;
    report['completedAt'] = new Date().toISOString();

    if (modelReady) {
      success(`Eidolon default model ready (${AUTO_DEFAULT_OLLAMA_MODEL_REF}).`);
    } else {
      warn(`Could not confirm model "${AUTO_DEFAULT_OLLAMA_MODEL_ID}" after pull attempt.`);
    }
    return report;
  }

  private commandExists(command: string): boolean {
    const result = spawnSync(command, ['--version'], {
      stdio: 'ignore',
      shell: false,
    });
    if (result.error) {
      return false;
    }
    return (result.status ?? 1) === 0;
  }

  private async installOllamaRuntime(): Promise<boolean> {
    if (process.platform === 'linux' || process.platform === 'darwin') {
      return await this.runStreamingCommand(
        'bash',
        ['-lc', 'curl -fsSL https://ollama.com/install.sh | sh'],
        4 * 60 * 1000
      );
    }
    warn('Automatic Ollama install is currently supported on Linux/macOS only.');
    return false;
  }

  private async ensureOllamaRuntimeReachable(): Promise<boolean> {
    const adapter = new OllamaAdapter();
    const initial = await adapter.health();
    if (initial.ok) {
      return true;
    }

    log('Starting Ollama runtime...');
    try {
      const child = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } catch {
      // Continue to retry health checks even if spawn fails.
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await this.sleep(800);
      const status = await adapter.health();
      if (status.ok) {
        return true;
      }
    }
    return false;
  }

  private async listOllamaModelIds(): Promise<string[]> {
    const adapter = new OllamaAdapter();
    try {
      const models = await adapter.discoverModels();
      const unique = new Set<string>();
      for (const model of models) {
        if (!model.stale && model.modelId.trim()) {
          unique.add(model.modelId.trim());
        }
      }
      return Array.from(unique).sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  private async runStreamingCommand(command: string, args: string[], timeoutMs: number): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      let done = false;
      let timer: NodeJS.Timeout | null = null;
      const finalize = (ok: boolean): void => {
        if (done) {
          return;
        }
        done = true;
        if (timer) {
          clearTimeout(timer);
        }
        resolve(ok);
      };

      const child = spawn(command, args, {
        stdio: 'inherit',
        shell: false,
      });

      timer = setTimeout(() => {
        child.kill('SIGTERM');
        finalize(false);
      }, timeoutMs);

      child.on('close', (code: number | null) => {
        finalize((code ?? 1) === 0);
      });
      child.on('error', () => {
        finalize(false);
      });
    });
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private async detectRuntimeContext(): Promise<Record<string, unknown>> {
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown';
    const base: Record<string, unknown> = {
      detectedAt: new Date().toISOString(),
      platform: process.platform,
      release: os.release(),
      arch: process.arch,
      timezone: localTimezone,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
      isWsl: process.platform === 'linux' && os.release().toLowerCase().includes('microsoft'),
    };

    const endpoints = [
      { provider: 'ipapi', url: 'https://ipapi.co/json/' },
      { provider: 'ipinfo', url: 'https://ipinfo.io/json' },
    ];

    for (const endpoint of endpoints) {
      try {
        const payload = await this.fetchJson(endpoint.url, 1500);
        if (!payload) {
          continue;
        }

        const country = this.readString(payload, ['country_name', 'country']);
        const region = this.readString(payload, ['region', 'region_name']);
        const city = this.readString(payload, ['city']);
        const timezone = this.readString(payload, ['timezone']);
        const ip = this.readString(payload, ['ip']);

        base['networkContext'] = {
          provider: endpoint.provider,
          country: country ?? null,
          region: region ?? null,
          city: city ?? null,
          timezone: timezone ?? null,
          ipHint: ip ? this.maskIp(ip) : null,
        };
        return base;
      } catch {
        // Silent by design: auto mode should never block on network hints.
      }
    }

    return base;
  }

  private async detectAutoBirthGeoProfile(currentTime: Date): Promise<{
    location: string;
    latitude: number;
    longitude: number;
    timezoneLabel?: string;
    timezoneOffset?: string;
  } | null> {
    const endpoints = [
      { provider: 'ipapi', url: 'https://ipapi.co/json/' },
      { provider: 'ipinfo', url: 'https://ipinfo.io/json' },
    ];

    for (const endpoint of endpoints) {
      const payload = await this.fetchJson(endpoint.url, 1500);
      if (!payload) {
        continue;
      }

      const coordinates = this.readCoordinates(payload);
      if (!coordinates) {
        continue;
      }

      const city = this.readString(payload, ['city']);
      const region = this.readString(payload, ['region', 'region_name']);
      const country = this.readString(payload, ['country_name', 'country']);
      const timezoneLabel = this.readString(payload, ['timezone']) ?? undefined;
      const timezoneOffset = timezoneLabel
        ? this.resolveTimezoneOffsetFromIana(timezoneLabel, currentTime) ?? undefined
        : undefined;
      const locationParts = [city, region, country].filter((value): value is string => Boolean(value));
      const location = locationParts.length > 0
        ? locationParts.join(', ')
        : `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)} (${endpoint.provider})`;

      return {
        location,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        timezoneLabel,
        timezoneOffset,
      };
    }

    return null;
  }

  private readCoordinates(payload: Record<string, unknown>): { latitude: number; longitude: number } | null {
    const directLatitude = this.readNumber(payload, ['latitude', 'lat']);
    const directLongitude = this.readNumber(payload, ['longitude', 'lon', 'lng']);
    if (directLatitude != null && directLongitude != null) {
      if (directLatitude >= -90 && directLatitude <= 90 && directLongitude >= -180 && directLongitude <= 180) {
        return {
          latitude: directLatitude,
          longitude: directLongitude,
        };
      }
    }

    const loc = this.readString(payload, ['loc']);
    if (!loc) {
      return null;
    }
    const parts = loc.split(',').map((value) => value.trim());
    if (parts.length !== 2) {
      return null;
    }
    const latitude = Number(parts[0]);
    const longitude = Number(parts[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return null;
    }
    return { latitude, longitude };
  }

  private readNumber(payload: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  }

  private resolveTimezoneOffsetFromIana(timezone: string, at: Date): string | null {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZoneName: 'shortOffset',
      });
      const part = formatter.formatToParts(at).find((entry) => entry.type === 'timeZoneName')?.value ?? '';
      if (!part) {
        return null;
      }
      if (part === 'GMT' || part === 'UTC') {
        return 'Z';
      }
      const match = part.match(/(?:GMT|UTC)([+-]\d{1,2})(?::?(\d{2}))?/i);
      if (!match) {
        return null;
      }
      const signedHour = Number(match[1]);
      if (!Number.isFinite(signedHour)) {
        return null;
      }
      const minute = match[2] ? Number(match[2]) : 0;
      if (!Number.isFinite(minute)) {
        return null;
      }
      const sign = signedHour >= 0 ? '+' : '-';
      const hh = String(Math.abs(signedHour)).padStart(2, '0');
      const mm = String(Math.abs(minute)).padStart(2, '0');
      if (hh === '00' && mm === '00') {
        return 'Z';
      }
      return `${sign}${hh}:${mm}`;
    } catch {
      return null;
    }
  }

  private async fetchJson(url: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }
      const parsed = await response.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private readString(payload: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  }

  private maskIp(ip: string): string {
    const value = ip.trim();
    if (!value) {
      return '';
    }
    if (value.includes(':')) {
      const parts = value.split(':').filter(Boolean);
      if (parts.length <= 2) return 'ipv6';
      return `${parts[0]}:${parts[1]}:*:*`;
    }
    const parts = value.split('.');
    if (parts.length !== 4) {
      return 'ip';
    }
    return `${parts[0]}.${parts[1]}.x.x`;
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
    const statuses: Partial<Record<SubstrateId, {
      ok: boolean;
      detail?: string;
      lastCheckedAt: string;
      modelCount?: number;
    }>> = {};
    let connectedCount = 0;

    log('Running substrata authentication probe...');
    for (const substrate of enabled) {
      const adapter = adapters[substrate];
      if (!adapter) {
        continue;
      }
      try {
        const status = await adapter.health();
        const statusWithModels: {
          ok: boolean;
          detail?: string;
          lastCheckedAt: string;
          modelCount?: number;
        } = { ...status };

        if (status.ok) {
          try {
            const discovered = await adapter.discoverModels();
            statusWithModels.modelCount = discovered.filter((model) => !model.stale).length;
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            statusWithModels.detail = `${status.detail ?? 'reachable'}; model discovery failed (${detail})`;
          }
        }

        statuses[substrate] = statusWithModels;
        if (statusWithModels.ok) {
          connectedCount += 1;
          const modelDetail = typeof statusWithModels.modelCount === 'number'
            ? `; ${statusWithModels.modelCount} model(s) visible`
            : '';
          success(`[${substrate}] connected (${statusWithModels.detail ?? 'reachable'}${modelDetail})`);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        statuses[substrate] = {
          ok: false,
          detail,
          lastCheckedAt: new Date().toISOString(),
        };
      }
    }

    if (connectedCount === 0) {
      log('No substrata connections detected in this probe.');
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
      heading: 'Connectors: select tools/services and configure API key or OAuth details.',
      menuPrompt: 'Initiation',
      existingSecrets: this.toolKeySecrets,
      allowedCategories: ['tool', 'service'],
    });
    this.applyCredentialSetupResult(result);
    const providerAuth = (this.config['providerAuthSetup'] as {
      providers?: string[];
      providerModelSelections?: Record<string, string[]>;
      catalogLastRefreshed?: string;
    } | undefined) ?? {};

    this.config['toolKeys'] = {
      providers: Array.isArray(providerAuth.providers) ? providerAuth.providers : [],
      tools: result.selected.tools,
      channels: [],
      services: result.selected.services,
      count: Object.keys(this.toolKeySecrets).length,
      storage: 'state/tool-keys.json',
      providerModelSelections: providerAuth.providerModelSelections ?? {},
      catalogLastRefreshed: result.catalogLastRefreshed || providerAuth.catalogLastRefreshed,
    };

    if (Object.keys(this.toolKeySecrets).length === 0) {
      success('No tool keys configured right now.');
    } else {
      success(`Captured ${Object.keys(this.toolKeySecrets).length} initiation value(s).`);
    }
  }

  private async captureChannelSynchronization(): Promise<void> {
    const result = await runCredentialSetupMenu({
      stateDir: getStateDir(),
      heading: 'Correspondence: select channels and configure required initiations.',
      existingSecrets: this.toolKeySecrets,
      allowedCategories: ['channel'],
    });
    this.applyCredentialSetupResult(result);

    const channels = result.selected.channels;
    this.config['channels'] = channels;
    this.config['channelCatalogLastRefreshed'] = result.catalogLastRefreshed;

    const currentToolKeys = (this.config['toolKeys'] as {
      providers?: string[];
      tools?: string[];
      channels?: string[];
      services?: string[];
      count?: number;
      storage?: string;
      providerModelSelections?: Record<string, string[]>;
      catalogLastRefreshed?: string;
    } | undefined) ?? {};
    this.config['toolKeys'] = {
      ...currentToolKeys,
      channels,
      count: Object.keys(this.toolKeySecrets).length,
      catalogLastRefreshed: result.catalogLastRefreshed || currentToolKeys.catalogLastRefreshed,
    };

    if (channels.length === 0) {
      success('No channels selected for synchronization.');
      return;
    }
    success(`Channel synchronization configured (${channels.length} channel(s)).`);
  }

  private async captureProviderAuthAndModels(): Promise<void> {
    const result = await runProviderCredentialSetupMenu({
      stateDir: getStateDir(),
      heading: 'Provider auth + models: select provider(s), configure API key/OAuth, then choose models.',
      existingSecrets: this.toolKeySecrets,
    });
    this.applyCredentialSetupResult(result);

    this.config['providerAuthSetup'] = {
      providers: result.selected.providers,
      providerModelSelections: result.providerModelSelections,
      catalogLastRefreshed: result.catalogLastRefreshed,
      count: Object.keys(this.toolKeySecrets).length,
    };
  }

  private applyCredentialSetupResult(result: CredentialSetupResult): void {
    this.toolKeySecrets = { ...result.secrets };
    for (const [env, value] of Object.entries(result.secrets)) {
      process.env[env] = value;
    }
  }

  private initializeSoulStructureRails(): void {
    const stateDir = getStateDir();
    fs.mkdirSync(stateDir, { recursive: true });

    const birthday = this.config['birthday'] as {
      date?: string;
      time?: string;
      timezoneOffset?: string;
      location?: string;
    } | undefined;

    this.config['soulRails'] = {
      protocol: 'birth.v1',
      stateDir,
      graphStore: path.join(stateDir, 'soul-graph.sqlite'),
      archiveDir: path.join(stateDir, 'archive'),
      capsulePath: path.join(stateDir, 'SOUL.md'),
      identitySeedReady: Boolean(birthday?.date),
      seededAt: new Date().toISOString(),
    };

    success('Soul materializing...');
    if (birthday?.date) {
      success(`Birthdata attached to core identity memory (${birthday.date} ${birthday.time ?? ''} ${birthday.timezoneOffset ?? ''}).`);
    }
  }

  private async initializeCoreMemories(): Promise<void> {
    log("Core Memory Setup: What's my birthday?");
    const mode = await this.promptSelect(
      'Begin the Great Work',
      ['Auto setup (fast)', 'Manual entry'],
      0
    );

    let birthDate = '';
    let birthTime = '';
    let normalizedTimezone = '';
    let birthTimezoneLabel = '';
    let birthLatitude = 0;
    let birthLongitude = 0;
    let birthLocation = '';
    const sourceTag = mode === 'Auto setup (fast)' ? 'auto_system' : 'author_provided';

    if (mode === 'Auto setup (fast)') {
      const now = new Date();
      const year = String(now.getFullYear()).padStart(4, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');

      birthDate = `${year}-${month}-${day}`;
      birthTime = `${hour}:${minute}`;
      normalizedTimezone = this.formatTimezoneOffset(now);
      birthTimezoneLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || normalizedTimezone;
      birthLatitude = 0;
      birthLongitude = 0;
      birthLocation = `Auto runtime profile (${birthTimezoneLabel})`;

      const geoProfile = await this.detectAutoBirthGeoProfile(now);
      if (geoProfile) {
        birthLatitude = geoProfile.latitude;
        birthLongitude = geoProfile.longitude;
        birthLocation = geoProfile.location;
        birthTimezoneLabel = geoProfile.timezoneLabel ?? birthTimezoneLabel;
        normalizedTimezone = geoProfile.timezoneOffset ?? normalizedTimezone;
        success('Auto core memory seeded from system clock + IP geo profile.');
      } else {
        success('Auto core memory seeded from system clock and timezone.');
      }
    } else {
      birthDate = await this.promptValidated(
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

      birthTime = parsedTimeTz.time;
      normalizedTimezone = parsedTimeTz.timezoneOffset;
      birthTimezoneLabel = parsedTimeTz.timezoneLabel;
      birthLatitude = parsedCoordinates.latitude;
      birthLongitude = parsedCoordinates.longitude;
      birthLocation = parsedCoordinates.location;
    }

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
          source: sourceTag,
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
    log('---');
  }

  private formatTimezoneOffset(value: Date): string {
    const minutes = -value.getTimezoneOffset();
    if (minutes === 0) {
      return 'Z';
    }
    const sign = minutes >= 0 ? '+' : '-';
    const absolute = Math.abs(minutes);
    const hh = String(Math.floor(absolute / 60)).padStart(2, '0');
    const mm = String(absolute % 60).padStart(2, '0');
    return `${sign}${hh}:${mm}`;
  }

  public async startGenesis(): Promise<Record<string, unknown>> {
    log('Step 1/9: Soul Imprint');
    await this.initializeCoreMemories();
    this.initializeSoulStructureRails();
    log('---');

    log('Step 2/9: All is Mind');
    await this.captureSubstrateConfig();
    if (this.substrateSetupMode === 'manual') {
      await this.captureProviderAuthAndModels();
    } else if (this.autoAssignedModelRef) {
      success(`Eidolon default model assigned (${this.autoAssignedModelRef}).`);
    } else {
      warn('Eidolon mode could not finalize local default model. You can retry in manual mode.');
    }
    await this.probeSubstrateConnections();
    log('---');

    log('Step 3/9: Instrumentation');
    await this.captureToolKeys();
    log('---');

    log('Step 4/9: Mindstrum');
    log('Scanning authenticated substrata...');
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
    log('---');

    log('Step 5/9: Machine Elves');
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

    if (this.substrateSetupMode === 'auto' && this.autoAssignedModelRef) {
      for (const role of AGENT_ROLES) {
        roleAssignments[role] = this.autoAssignedModelRef;
        try {
          await setModelForRole(role, this.autoAssignedModelRef, {
            availableModels: discovered,
            stateDir: getStateDir(),
          });
        } catch {
          // Keep assignment even if registry cannot validate immediately.
        }
      }
      success(`Auto role assignment applied (${this.autoAssignedModelRef}) to all roles.`);
    } else {
      for (const role of AGENT_ROLES) {
        if (discoveredProviders.length === 0) {
          const fallback = await this.prompt(
            `Assign model reference for role "${role}" (<substrata>:<modelId>)`,
            AUTO_DEFAULT_OLLAMA_MODEL_REF
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
    }

    this.config['roleAssignments'] = roleAssignments;
    success('Machine Elf role assignments stored.');
    log('---');

    log('Step 6/9: Correspondence');
    await this.captureChannelSynchronization();
    log('---');

    log('Step 7/9: Treasury & Wallet Policy');
    this.config['treasuryPolicy'] = await this.prompt(
      'Enter treasury policy (JSON, optional)',
      '{}'
    );
    success('Treasury policy captured.');
    log('---');

    log('Step 8/9: Identity, Name & Objective');
    this.config['soulName'] = await this.prompt('Name this soul');
    this.config['soulObjective'] = await this.prompt('Define the primary objective');
    success(`Soul named "${String(this.config['soulName'])}" with objective "${String(this.config['soulObjective'])}".`);
    log('---');

    log('Step 9/9: Initialization');
    await this.initializeState();
    success('Soul initialization complete.');
    log('---');

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
