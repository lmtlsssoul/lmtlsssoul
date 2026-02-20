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

export class SoulBirthPortal {
  private config: Record<string, unknown> = {};

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
    this.config['substrateConfig'] = await this.prompt(
      'Enter substrate connection config (JSON, optional)',
      '{}'
    );
    success('Substrate config captured.');
    log('\n---\n');

    log('Step 2/8: Tool Keys (Optional)');
    this.config['toolKeys'] = await this.prompt(
      'Enter tool key config (JSON, optional)',
      '{}'
    );
    success('Tool key config captured.');
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
}
