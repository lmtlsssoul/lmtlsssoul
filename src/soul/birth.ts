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

type ToolKeyOption = {
  label: string;
  env: string;
  purpose: string;
};

const TOOL_KEY_OPTIONS: readonly ToolKeyOption[] = [
  { label: 'Brave Search', env: 'BRAVE_API_KEY', purpose: 'Web search' },
  { label: 'Serper Search', env: 'SERPER_API_KEY', purpose: 'Google search API' },
  { label: 'Tavily Search', env: 'TAVILY_API_KEY', purpose: 'Retrieval/search' },
  { label: 'GitHub', env: 'GITHUB_TOKEN', purpose: 'Repository and API access' },
  { label: 'OpenAI', env: 'OPENAI_API_KEY', purpose: 'OpenAI substrate access' },
  { label: 'Anthropic', env: 'ANTHROPIC_API_KEY', purpose: 'Anthropic substrate access' },
  { label: 'xAI', env: 'XAI_API_KEY', purpose: 'xAI substrate access' },
];

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
      return;
    }

    const rawManual = await this.prompt('Enter substrate config JSON', '{}');
    try {
      this.config['substrateConfig'] = this.parseJsonObject(rawManual, 'Substrate config');
      success('Substrate config captured.');
    } catch (err) {
      warn(err instanceof Error ? err.message : 'Invalid substrate JSON.');
      warn('Falling back to auto setup.');
      this.config['substrateConfig'] = {
        mode: 'auto',
        enabledSubstrates: ['ollama', 'openai', 'anthropic', 'xai'],
      };
      success('Substrate config auto-initialized.');
    }
  }

  private async captureToolKeys(): Promise<void> {
    const choices = TOOL_KEY_OPTIONS.map((item) => `${item.label} (${item.env}) — ${item.purpose}`);
    const selected = await this.promptMultiSelect('Select tool keys to configure now (optional)', choices);

    if (selected.length === 0) {
      this.config['toolKeys'] = {
        providers: [],
        count: 0,
        storage: 'state/tool-keys.json',
      };
      success('No tool keys configured right now.');
      return;
    }

    for (const selectedLabel of selected) {
      const option = TOOL_KEY_OPTIONS.find((item) => selectedLabel.startsWith(item.label));
      if (!option) {
        continue;
      }
      const value = await this.promptSecret(`Enter ${option.env} (leave blank to skip)`);
      if (!value) {
        continue;
      }
      this.toolKeySecrets[option.env] = value;
      process.env[option.env] = value;
    }

    this.config['toolKeys'] = {
      providers: Object.keys(this.toolKeySecrets),
      count: Object.keys(this.toolKeySecrets).length,
      storage: 'state/tool-keys.json',
    };
    success(`Captured ${Object.keys(this.toolKeySecrets).length} tool key(s).`);
  }

  private async initializeCoreMemories(): Promise<void> {
    log('Core Memory Setup: Birthday');
    const birthDate = await this.prompt('Enter birthdate to encode (e.g., 2026-02-18)');
    const birthTime = await this.prompt('Enter birth time to encode (e.g., 14:32 UTC)');
    const birthLocation = await this.prompt('Enter birth location to encode');

    const createdAt = new Date().toISOString();
    this.config['birthday'] = {
      date: birthDate,
      time: birthTime,
      location: birthLocation,
    };
    this.config['coreMemories'] = [
      {
        key: 'birthday',
        nodeType: 'identity',
        premise: `My birthday is ${birthDate} at ${birthTime} in ${birthLocation}.`,
        createdAt,
        metadata: {
          source: 'author_provided',
          birthDate,
          birthTime,
          birthLocation,
        },
      },
    ];
    success('Core memory initialized: birthday.');
    log('\n---\n');
  }

  public async startGenesis(): Promise<Record<string, unknown>> {
    await this.initializeCoreMemories();

    log('Step 1/8: Substrate Connection & Authentication');
    await this.captureSubstrateConfig();
    log('\n---\n');

    log('Step 2/8: Tool Keys & Search Connectors (Optional)');
    await this.captureToolKeys();
    log('\n---\n');

    log('Step 3/8: Model Discovery');
    log('Scanning authenticated substrates...');
    const modelsBySubstrate = await scanForModels({ persist: true });
    const discovered = Object.values(modelsBySubstrate).flat();
    this.config['discoveredModels'] = discovered.map((model) => `${model.substrate}:${model.modelId}`);
    success(`Discovered ${discovered.length} callable model(s).`);
    if (discovered.length === 0) {
      warn('No models discovered. Is Ollama running? Try: ollama serve');
      warn('You can assign models manually later: soul models scan');
    }
    log('\n---\n');

    log('Step 4/8: Agent Role Assignment');
    const roleAssignments: Record<string, string> = {};
    const firstAvailable = discovered[0] ? `${discovered[0].substrate}:${discovered[0].modelId}` : 'ollama:phi3:mini';

    for (const role of AGENT_ROLES) {
      const answer = await this.prompt(
        `Assign model reference for role "${role}" (<substrate>:<modelId>)`,
        firstAvailable
      );
      if (!answer) continue;
      try {
        await setModelForRole(role, answer, {
          availableModels: discovered,
          stateDir: getStateDir(),
        });
        roleAssignments[role] = answer;
      } catch (e) {
        warn(`Could not validate model "${answer}" for role "${role}" — saving anyway.`);
        roleAssignments[role] = answer;
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
    const birthday = this.config['birthday'] as { date?: string; time?: string; location?: string } | undefined;
    if (birthday?.date) {
      graph.createNode({
        premise: `My birthday is ${birthday.date} at ${birthday.time ?? ''} in ${birthday.location ?? ''}.`,
        nodeType: 'identity',
        weight: { salience: 1.0, commitment: 0.99, valence: 0.9, uncertainty: 0.01, resonance: 0.9, arousal: 0.2 },
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
