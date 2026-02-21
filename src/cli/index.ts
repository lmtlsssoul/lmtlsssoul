import { Command, CommanderError } from 'commander';
import enquirer from 'enquirer';
import { getBanner, printBanner, log, error, success, warn } from '../soul/branding.ts';
import { SoulBirthPortal } from '../soul/birth.ts';
import { scanForModels, setModelForRole } from '../soul/models-scan.ts';
import { GatewayServer } from '../gateway/server.ts';
import { registerTreasuryCommands } from './treasury.ts';
import { getStateDir, DEFAULT_CONFIG } from '../soul/types.ts';
import { GraphDB } from '../soul/graph-db.ts';
import { ArchiveDB } from '../soul/archive-db.ts';
import { SoulRecall } from '../soul/recall.ts';
import { SoulCompiler } from '../soul/compiler.ts';
import { IdentityDigest } from '../soul/identity-digest.ts';
import { SoulCirculation } from '../soul/circulation.ts';
import { getRoleAssignments } from '../substrate/assignment.ts';
import { OllamaAdapter } from '../substrate/ollama.ts';
import { OpenaiAdapter } from '../substrate/openai.ts';
import { AnthropicAdapter } from '../substrate/anthropic.ts';
import { XaiAdapter } from '../substrate/xai.ts';
import { deriveGrownupCapabilities, readGrownupMode, setGrownupMode } from '../soul/modes.ts';
import { Reflection } from '../agents/reflection.ts';
import { loadToolKeys, persistToolKeys, runCredentialSetupMenu } from '../soul/credentials.ts';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { SubstrateAdapter } from '../substrate/types.ts';

type DaemonState = {
  pid: number;
  host: string;
  port: number;
  startedAt: string;
};

/**
 * Main entry point for the soul CLI.
 */
export async function main() {
  const program = new Command();

  program
    .name('soul')
    .description('lmtlss soul - persistent AI personhood')
    .version('0.1.0')
    .action(async () => {
      await launchTerminalArtBlocking();
    })
    .hook('preAction', async (thisCommand) => {
      // Don't show banner for help or version
      if (thisCommand.args[0] === 'help') return;
      const vargs = ['-V', '--version'];
      if (vargs.includes(thisCommand.args[0])) return;
      const argv = process.argv.slice(2);
      if (argv.length === 0 || argv[0] === 'art') return;
      await printBanner();
    });

  registerTreasuryCommands(program);

  program.command('birth')
    .alias('incarnate')
    .description('Open the soul Incarnation Portal')
    .option('--python <binary>', 'Python runtime binary for the scry portal prelude')
    .action(async (options: { python?: string }) => {
      await launchTerminalArtBlocking(options.python);
      await runBirthPreludeMenu(options.python);
      const birthPortal = new SoulBirthPortal();
      await birthPortal.startGenesis();
    });

  program.command('start')
    .alias('kindle')
    .description('Kindle the soul daemon (the other kind)')
    .option('-p, --port <port>', 'Gateway port', '3000')
    .option('-H, --host <host>', 'Gateway host', '127.0.0.1')
    .action(async (options: { port: string; host: string }) => {
      const state = readDaemonState();
      if (state && isProcessAlive(state.pid)) {
        warn(`Daemon (the other kind) already running (pid=${state.pid}) on ${state.host}:${state.port}.`);
        return;
      }

      const host = options?.host ?? '127.0.0.1';
      const port = Number.parseInt(options?.port ?? '3000', 10);
      const entrypoint = resolveDaemonEntrypoint();

      log(`Summoning daemon (the other kind) on ${host}:${port}...`);
      const child = spawn(process.execPath, [entrypoint, 'gateway', 'start', '--host', host, '--port', String(port)], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      if (!child.pid) {
        throw new Error('Failed to start daemon (the other kind) process.');
      }

      writeDaemonState({
        pid: child.pid,
        host,
        port,
        startedAt: new Date().toISOString(),
      });
      success(`Daemon (the other kind) started (pid=${child.pid}).`);
    });

  program.command('stop')
    .alias('still')
    .description('Still the soul daemon (the other kind)')
    .action(async () => {
      const state = readDaemonState();
      if (!state) {
        warn('No daemon (the other kind) state file found.');
        return;
      }

      if (isProcessAlive(state.pid)) {
        process.kill(state.pid, 'SIGTERM');
        success(`Daemon (the other kind) process ${state.pid} stopped.`);
      } else {
        warn(`Daemon (the other kind) process ${state.pid} was not running.`);
      }

      removeDaemonState();
    });

  program.command('status')
    .alias('omens')
    .alias('vessel')
    .description('Read soul omens')
    .action(async () => {
      const stateDir = getStateDir();
      const state = readDaemonState();
      const daemonRunning = state ? isProcessAlive(state.pid) : false;
      const gatewayHealth = state
        ? await getGatewayHealth(state.host, state.port)
        : { ok: false, detail: 'Daemon (the other kind) not started.' };

      const graph = new GraphDB(stateDir);
      const archive = new ArchiveDB(stateDir);
      const buildInfo = resolveBuildInfo();

      log('--- Soul Omens ---');
      console.log(`State Dir: ${stateDir}`);
      if (buildInfo) {
        console.log(`Build Ref: ${buildInfo.ref}`);
        console.log(`Build Commit: ${buildInfo.commit}`);
        if (buildInfo.installedAt) {
          console.log(`Build Installed At: ${buildInfo.installedAt}`);
        }
      }
      console.log(`Daemon (the other kind): ${daemonRunning ? `running (pid=${state?.pid})` : 'stopped'}`);
      console.log(`Gateway: ${gatewayHealth.ok ? 'healthy' : 'unreachable'}`);
      if (gatewayHealth.detail) {
        console.log(`Gateway Detail: ${gatewayHealth.detail}`);
      }
      console.log(`Graph Nodes: ${graph.getNodeCount()}`);
      console.log(`Archive Events: ${archive.getEventCount()}`);
    });

  program.command('grownup')
    .description('Master switch for Author-level self-optimization, self-authoring, and root intent')
    .argument('[state]', 'on | off | status', 'status')
    .action((stateInput: string) => {
      const state = normalizeGrownupState(stateInput);
      if (!state) {
        throw new Error('Invalid grownup mode state. Use "on", "off", or "status".');
      }

      if (state === 'status') {
        printGrownupModeStatus();
        return;
      }

      const mode = setGrownupMode(state === 'on', { updatedBy: 'author_cli' });
      const capabilities = deriveGrownupCapabilities(mode);
      success(`Grownup mode ${mode.enabled ? 'enabled' : 'disabled'}.`);
      printGrownupSummary(mode, capabilities);

      if (mode.enabled && capabilities.deepestPrivilege !== 'root') {
        warn('Root-intent is enabled, but no root-grade path is available in this session.');
      }
    });

  const modelsCommand = program.command('models')
    .description('Manage substrata minds');

  modelsCommand.command('scan')
    .description('Scan minds across all substrata')
    .action(async () => {
      log('Scanning for minds...');
      const modelsBySubstrate = await scanForModels();
      for (const [substrate, models] of Object.entries(modelsBySubstrate)) {
        console.log(`\n=== ${substrate.toUpperCase()} ===`);
        console.table(models);
      }
      success('Mind scan complete.');
    });

  modelsCommand.command('set')
    .description('Bind a mind to a Machine Elf role')
    .argument('<role>', 'The Machine Elf role to bind (e.g., interface, compiler)')
    .argument('<modelRef>', 'The mind reference (<substrata>:<modelId> or unique <modelId>)')
    .action(async (role, modelId) => {
      log(`Binding mind to Machine Elf role...`);
      await setModelForRole(role, modelId);
      success(`Mind for Machine Elf role "${role}" bound to "${modelId}".`);
    });

  const gatewayCommand = program.command('gateway')
    .description('Manage the API gateway server');

  gatewayCommand.command('start')
    .description('Start the gateway server in the foreground')
    .option('-p, --port <port>', 'Port to listen on', '3000')
    .option('-H, --host <host>', 'Host to bind to', '127.0.0.1')
    .action(async (options) => {
      log('Starting gateway server...');
      const port = parseInt(options.port, 10);
      const server = new GatewayServer({ port, host: options.host });
      try {
        await server.start();
        log('Gateway server started. Press Ctrl+C to stop.');
        // Keep the process alive
        process.stdin.resume();
      } catch (e) {
        if (e instanceof Error) {
          error(`Failed to start gateway server: ${e.message}`);
        } else {
          error('Failed to start gateway server due to an unknown error.');
        }
        process.exit(1);
      }
    });

  gatewayCommand.command('status')
    .description('Check the status of the gateway server')
    .option('-p, --port <port>', 'Port to check', '3000')
    .option('-H, --host <host>', 'Host to check', '127.0.0.1')
    .action(async (options) => {
      log('Checking gateway server status...');
      const port = parseInt(options.port, 10);
      
      const checkStatus = (): Promise<void> => {
        return new Promise((resolve, reject) => {
          const req = http.get({
            host: options.host,
            port: port,
            path: '/health',
            timeout: 2000,
          }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode === 200) {
                try {
                  const parsed = JSON.parse(data);
                  success(`Gateway is running and healthy. Timestamp: ${parsed.timestamp}`);
                  resolve();
                } catch (e) {
                  error('Failed to parse health check response.');
                  reject(e);
                }
              } else {
                error(`Gateway returned non-200 status: ${res.statusCode}`);
                reject(new Error(`Status code: ${res.statusCode}`));
              }
            });
          });

          req.on('error', (e) => {
            error(`Gateway is not reachable: ${e.message}`);
            reject(e);
          });

          req.end();
        });
      };

      try {
        await checkStatus();
      } catch (e) {
        // Error is already logged in the promise handlers
        process.exit(1);
      }
    });

  const archiveCommand = program.command('archive')
    .description('Archive integrity commands');

  archiveCommand.command('verify')
    .description('Verify archive hash-chain integrity')
    .action(() => {
      const archive = new ArchiveDB(getStateDir());
      const result = archive.verifyHashChain();
      if (result.ok) {
        success(`Archive hash-chain verified (${result.checked} events checked).`);
      } else {
        error(`Archive verification failed with ${result.errors.length} issue(s).`);
        for (const issue of result.errors) {
          console.error(`- ${issue}`);
        }
        process.exitCode = 1;
      }
    });

  program.command('reflect')
    .description('Trigger immediate reflection pass')
    .action(async () => {
      const reflection = new Reflection();
      const result = await reflection.execute({ mode: 'manual' });
      success('Reflection pass complete.');
      console.log(JSON.stringify(result, null, 2));
    });

  program.command('config')
    .description('Open interactive initiations configuration (same menu as Birth Step 2)')
    .action(async () => {
      await runCredentialsConfigFlow();
    });

  program.command('chat')
    .alias('commune')
    .description('Open an interactive terminal communion with the soul')
    .option('--peer <name>', 'Your name (peer identity)', 'author')
    .option('--channel <channel>', 'Channel label', 'terminal')
    .action(async (options: { peer: string; channel: string }) => {
      await runInteractiveChat(options.peer, options.channel);
    });

  program.command('art')
    .description('Launch the terminal art field renderer')
    .option('--python <binary>', 'Python runtime binary (defaults to SOUL_ART_PYTHON or python3)')
    .action((options: { python?: string }) => {
      launchTerminalArt(options.python);
    });

  // Root portal flow: plain `soul` opens scrying, then shows command menu.
  if (process.argv.slice(2).length === 0) {
    await runRootPortalMenu();
    return;
  }

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CommanderError) {
      // Commander already prints the error.
      // We rethrow to make tests fail. In production, you might want to process.exit(1)
      throw err;
    } else if (err instanceof Error) {
      error(`Fatal error: ${err.message}`, err.stack);
      throw err;
    } else {
      error('An unknown fatal error occurred.', err);
      throw err;
    }
  }
}

async function runCredentialsConfigFlow(): Promise<void> {
  const stateDir = getStateDir();
  fs.mkdirSync(stateDir, { recursive: true });

  const existingSecrets = loadToolKeys(stateDir);
  const result = await runCredentialSetupMenu({
    stateDir,
    heading: 'Initiations Config: provider/tool/channel catalog (daily refreshed).',
    existingSecrets,
  });

  const persisted = persistToolKeys(result.secrets, stateDir);
  success(`Initiations store updated at ${persisted.path} (${persisted.count} key(s)).`);

  const birthConfigPath = path.join(stateDir, 'birth-config.json');
  if (fs.existsSync(birthConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(birthConfigPath, 'utf-8')) as Record<string, unknown>;
      parsed['toolKeys'] = {
        providers: result.selected.providers,
        tools: result.selected.tools,
        channels: result.selected.channels,
        services: result.selected.services,
        count: persisted.count,
        storage: 'state/tool-keys.json',
        providerModelSelections: result.providerModelSelections,
        catalogLastRefreshed: result.catalogLastRefreshed,
      };
      fs.writeFileSync(birthConfigPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
      success(`Birth config tool-key summary updated at ${birthConfigPath}.`);
    } catch (err) {
      warn(`Could not update birth-config.json summary (${err instanceof Error ? err.message : 'parse error'}).`);
    }
  }
}

// ── Interactive Chat ──────────────────────────────────────────────────────────

async function runInteractiveChat(peer: string, channel: string): Promise<void> {
  const stateDir = getStateDir();

  if (!fs.existsSync(path.join(stateDir, 'birth-config.json'))) {
    error('Soul not yet incarnated. Run "soul birth" first.');
    process.exit(1);
  }

  const graph = new GraphDB(stateDir);
  const archive = new ArchiveDB(stateDir);
  const recall = new SoulRecall(archive, graph);
  const compiler = new SoulCompiler(graph);

  // Load soul name from birth config
  let soulName = 'soul';
  let soulObjective = 'be present';
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(stateDir, 'birth-config.json'), 'utf-8')) as {
      soulName?: string;
      soulObjective?: string;
    };
    if (cfg.soulName) soulName = cfg.soulName;
    if (cfg.soulObjective) soulObjective = cfg.soulObjective;
  } catch { /* use defaults */ }

  const identity = new IdentityDigest({
    ...DEFAULT_CONFIG,
    stateDir,
    name: soulName,
    objective: soulObjective,
  });
  const circulation = new SoulCirculation(archive, graph, recall, compiler, identity);

  // Resolve model for interface role
  const assignments = getRoleAssignments(stateDir);
  const interfaceRef = assignments.interface;
  const adapter = resolveChatAdapter(interfaceRef);
  const modelId = interfaceRef.split(':').slice(1).join(':');

  await printBanner();
  log(`\nConversation with ${soulName} | model: ${interfaceRef}`);
  log('Type "exit" or press Ctrl+C to end the session.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  const GREEN = '\x1b[38;2;74;246;38m';
  const DIM = '\x1b[2m';
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';

  process.stdout.write(`${DIM}─────────────────────────────────────────${RESET}\n`);

  while (true) {
    let input: string;
    try {
      input = await ask(`${GREEN}${BOLD}Author${RESET} ${DIM}>${RESET} `);
    } catch {
      break;
    }

    input = input.trim();
    if (!input) continue;
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') break;

    process.stdout.write(`\n${DIM}◉ thinking...${RESET}\n`);

    try {
      const mind = async (prompt: string): Promise<string> => {
        const result = await adapter.invoke({ model: modelId, prompt, role: 'interface' });
        return result.outputText;
      };

      const result = await circulation.run(input, {
        agentId: 'interface',
        channel,
        peer,
        model: interfaceRef,
      }, mind);

      const reply = result.reply.replace(/<index_update>[\s\S]*?<\/index_update>/g, '').trim();
      process.stdout.write(`\n${GREEN}${BOLD}${soulName}${RESET}\n${reply}\n\n`);
      process.stdout.write(`${DIM}─────────────────────────────────────────${RESET}\n`);
    } catch (err) {
      error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      warn('Is Ollama running? Try: ollama serve');
    }
  }

  rl.close();
  success('\nSession ended. Presence persists.');
}

function resolveChatAdapter(modelRef: string): SubstrateAdapter {
  const colon = modelRef.indexOf(':');
  const substrate = colon > 0 ? modelRef.slice(0, colon) : 'ollama';
  switch (substrate) {
    case 'anthropic': return new AnthropicAdapter();
    case 'openai': return new OpenaiAdapter();
    case 'xai': return new XaiAdapter();
    case 'ollama':
    default: return new OllamaAdapter();
  }
}

function isCliEntry(): boolean {
  const argvEntry = process.argv[1];
  if (!argvEntry) {
    return false;
  }

  return import.meta.url === pathToFileURL(argvEntry).href;
}

if (isCliEntry()) {
  void main().catch(() => {
    process.exit(1);
  });
}

function daemonStatePath(): string {
  return path.join(getStateDir(), 'daemon.json');
}

function readDaemonState(): DaemonState | null {
  const statePath = daemonStatePath();
  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as DaemonState;
  } catch {
    return null;
  }
}

function writeDaemonState(state: DaemonState): void {
  const statePath = daemonStatePath();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

function removeDaemonState(): void {
  const statePath = daemonStatePath();
  if (fs.existsSync(statePath)) {
    fs.rmSync(statePath);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function getGatewayHealth(
  host: string,
  port: number
): Promise<{ ok: boolean; detail?: string }> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host,
        port,
        path: '/health',
        timeout: 1500,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ ok: true });
            return;
          }
          resolve({ ok: false, detail: `HTTP ${res.statusCode ?? 0}: ${body}` });
        });
      }
    );

    req.on('error', (err) => {
      resolve({ ok: false, detail: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, detail: 'Timed out' });
    });
  });
}

function normalizeGrownupState(value: string | undefined): 'on' | 'off' | 'status' | null {
  const normalized = (value ?? 'status').trim().toLowerCase();
  if (normalized === 'on' || normalized === 'off' || normalized === 'status') {
    return normalized;
  }
  return null;
}

function resolveDaemonEntrypoint(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Source layout: src/cli/index.ts -> ../../soul.mjs
    path.resolve(moduleDir, '../../soul.mjs'),
    // Bundled layout: dist/index.js -> ../soul.mjs
    path.resolve(moduleDir, '../soul.mjs'),
    // Local fallback for direct repository execution.
    path.resolve(process.cwd(), 'soul.mjs'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Unable to resolve daemon (the other kind) entrypoint (soul.mjs).');
}

function printGrownupModeStatus(): void {
  const mode = readGrownupMode();
  const capabilities = deriveGrownupCapabilities(mode);
  log('--- Grownup Mode ---');
  printGrownupSummary(mode, capabilities);
}

function printGrownupSummary(
  mode: ReturnType<typeof readGrownupMode>,
  capabilities: ReturnType<typeof deriveGrownupCapabilities>
): void {
  console.log(`State: ${mode.enabled ? 'on' : 'off'}`);
  console.log(`Self Optimize: ${capabilities.selfOptimize ? 'enabled' : 'disabled'}`);
  console.log(`Self Author: ${capabilities.selfAuthor ? 'enabled' : 'disabled'}`);
  console.log(`Root Intent: ${capabilities.rootIntent ? 'enabled' : 'disabled'}`);
  console.log(`Root Access: ${capabilities.rootAccessActive ? 'active' : 'inactive'}`);
  console.log(`Privilege Level: ${capabilities.privilegeLevel}`);
  console.log(`Incarnation Substrata: ${capabilities.substrate}`);
  console.log(`Cloud Runtime: ${capabilities.cloud ? 'yes' : 'no'}`);
  console.log(`Current Privilege: ${capabilities.currentPrivilege}`);
  console.log(`Deepest Privilege: ${capabilities.deepestPrivilege}`);
  console.log(`Escalation Strategy: ${capabilities.escalationStrategy}`);
  if (capabilities.notes.length > 0) {
    for (const note of capabilities.notes) {
      console.log(`- ${note}`);
    }
  }
  if (mode.updatedAt) {
    console.log(`Updated At: ${mode.updatedAt}`);
  }
}

function launchTerminalArt(pythonOverride?: string): void {
  const child = spawnTerminalArtProcess(pythonOverride);
  child.on('error', (err) => {
    handleTerminalArtSpawnError(err, pythonOverride);
  });
}

async function launchTerminalArtBlocking(pythonOverride?: string): Promise<void> {
  const child = spawnTerminalArtProcess(pythonOverride);
  await new Promise<void>((resolve, reject) => {
    child.on('error', (err) => {
      handleTerminalArtSpawnError(err, pythonOverride);
      reject(err);
    });
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if ((code ?? 0) === 0 && signal === null) {
        resolve();
        return;
      }
      const exitCode = code ?? -1;
      const viaSignal = signal ? ` (signal: ${signal})` : '';
      reject(new Error(`Terminal art exited unexpectedly with code ${exitCode}${viaSignal}.`));
    });
  });
}

async function runBirthPreludeMenu(pythonOverride?: string): Promise<void> {
  const green = (value: string): string => `\u001b[32m${value}\u001b[39m`;
  const red = (value: string): string => `\u001b[31m${value}\u001b[39m`;
  while (true) {
    const response: { value: string } = await enquirer.prompt({
      type: 'select',
      name: 'value',
      message: 'Scrying terminal controls',
      promptLine: false,
      pointer: {
        on: '\u001b[31m▸\u001b[39m',
        off: ' ',
      },
      styles: {
        primary: green,
        em: red,
      },
      choices: [
        'Press ENTER to scry',
        'Open Incarnation Portal',
      ],
      initial: 0,
    } as never);

    if (response.value === 'Press ENTER to scry') {
      await launchTerminalArtBlocking(pythonOverride);
      continue;
    }
    break;
  }
}

async function runRootPortalMenu(): Promise<void> {
  const green = (value: string): string => `\u001b[32m${value}\u001b[39m`;
  const red = (value: string): string => `\u001b[31m${value}\u001b[39m`;
  const menuChoices = [
    'Press ENTER to scry',
    'Open Incarnation Portal',
    'Open Communion',
    'Read Vessel State',
    'Configure Initiations',
    'Scan Minds',
    'Start Daemon (the other kind)',
    'Stop Daemon (the other kind)',
    'Invoke Command',
    'Open Grimoire',
    'Close Portal',
  ];

  // Root launch sequence: scry first, then menu.
  await launchTerminalArtBlocking();

  while (true) {
    const response: { value: string } = await enquirer.prompt({
      type: 'select',
      name: 'value',
      message: 'Command Grimoire',
      promptLine: false,
      pointer: {
        on: '\u001b[31m▸\u001b[39m',
        off: ' ',
      },
      styles: {
        primary: green,
        em: red,
      },
      choices: menuChoices,
      initial: 0,
    } as never);

    const choice = response.value;
    if (choice === 'Press ENTER to scry') {
      await launchTerminalArtBlocking();
      continue;
    }
    if (choice === 'Open Incarnation Portal') {
      await runSoulSubcommand(['birth']);
      continue;
    }
    if (choice === 'Open Communion') {
      await runSoulSubcommand(['chat']);
      continue;
    }
    if (choice === 'Read Vessel State') {
      await runSoulSubcommand(['status']);
      continue;
    }
    if (choice === 'Configure Initiations') {
      await runSoulSubcommand(['config']);
      continue;
    }
    if (choice === 'Scan Minds') {
      await runSoulSubcommand(['models', 'scan']);
      continue;
    }
    if (choice === 'Start Daemon (the other kind)') {
      await runSoulSubcommand(['start']);
      continue;
    }
    if (choice === 'Stop Daemon (the other kind)') {
      await runSoulSubcommand(['stop']);
      continue;
    }
    if (choice === 'Open Grimoire') {
      await runSoulSubcommand(['--help']);
      continue;
    }
    if (choice === 'Invoke Command') {
      const custom = await promptRawSoulCommand(green, red);
      if (!custom) {
        continue;
      }
      const customArgs = splitCommandArgs(custom);
      if (customArgs.length === 0) {
        continue;
      }
      await runSoulSubcommand(customArgs);
      continue;
    }
    break;
  }
}

async function promptRawSoulCommand(
  green: (value: string) => string,
  red: (value: string) => string
): Promise<string> {
  const response: { value: string } = await enquirer.prompt({
    type: 'input',
    name: 'value',
    message: 'Enter invocation arguments (example: gateway status --port 3000)',
    styles: {
      primary: green,
      em: red,
    },
  } as never);
  return response.value.trim();
}

function splitCommandArgs(raw: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const ch of raw) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === '\\') {
      escaping = true;
      continue;
    }
    if ((ch === '"' || ch === "'")) {
      if (quote === null) {
        quote = ch;
        continue;
      }
      if (quote === ch) {
        quote = null;
        continue;
      }
      current += ch;
      continue;
    }
    if (/\s/.test(ch) && quote === null) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }

  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

async function runSoulSubcommand(args: string[]): Promise<void> {
  const entrypoint = resolveDaemonEntrypoint();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if ((code ?? 0) === 0 && signal === null) {
        resolve();
        return;
      }
      const joined = args.join(' ');
      const detail = signal ? `signal ${signal}` : `code ${code ?? -1}`;
      warn(`Command "soul ${joined}" exited with ${detail}.`);
      resolve();
    });
  });
}

function spawnTerminalArtProcess(pythonOverride?: string) {
  const entrypoint = resolveTerminalArtEntrypoint();
  const python = (pythonOverride?.trim() || process.env.SOUL_ART_PYTHON?.trim() || 'python3');
  log('Launching scrying terminal...');
  const restoreViewport = enterTerminalArtViewport();

  const launch = resolveTerminalArtLaunchCommand(python, entrypoint);
  const child = spawn(launch.command, launch.args, {
    stdio: 'inherit',
    env: process.env,
  });
  const restoreOnce = once(restoreViewport);
  bindChildEvent(child as unknown as { on?: Function; once?: Function }, 'exit', restoreOnce);
  bindChildEvent(child as unknown as { on?: Function; once?: Function }, 'error', restoreOnce);
  return child;
}

function handleTerminalArtSpawnError(err: Error, pythonOverride?: string): void {
  const python = (pythonOverride?.trim() || process.env.SOUL_ART_PYTHON?.trim() || 'python3');
  const maybeErr = err as NodeJS.ErrnoException;
  if (maybeErr.code === 'ENOENT') {
    error(`Unable to find Python runtime "${python}". Install python3 or pass --python <binary>.`);
    return;
  }
  error(`Terminal art launch failed: ${err.message}`);
}

function resolveTerminalArtEntrypoint(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Source layout: src/cli/index.ts -> ../../terminalart/art.9.py
    path.resolve(moduleDir, '../../terminalart/art.9.py'),
    // Bundled layout: dist/index.js -> ../terminalart/art.9.py
    path.resolve(moduleDir, '../terminalart/art.9.py'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Unable to resolve terminal art entrypoint (terminalart/art.9.py).');
}

function resolveBuildInfo(): { ref: string; commit: string; installedAt?: string } | null {
  const cwdCandidate = path.resolve(process.cwd(), '.lmtlss-build.json');
  const homeCandidate = path.resolve(os.homedir(), '.lmtlss/src/.lmtlss-build.json');
  const candidates = [cwdCandidate, homeCandidate];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as {
        ref?: unknown;
        commit?: unknown;
        installedAt?: unknown;
      };
      const ref = typeof parsed.ref === 'string' && parsed.ref.trim() ? parsed.ref.trim() : 'unknown';
      const commit = typeof parsed.commit === 'string' && parsed.commit.trim() ? parsed.commit.trim() : 'unknown';
      const installedAt = typeof parsed.installedAt === 'string' && parsed.installedAt.trim()
        ? parsed.installedAt.trim()
        : undefined;
      return { ref, commit, installedAt };
    } catch {
      continue;
    }
  }

  return null;
}

function enterTerminalArtViewport(): () => void {
  if (!process.stdout.isTTY) {
    return () => {};
  }

  const supportsWindowOps = terminalSupportsWindowOps();
  const out = process.stdout;

  // Hide cursor during portal prelude.
  out.write('\x1b[?25l');

  if (supportsWindowOps) {
    // Best-effort fullscreen/maximize using terminal window ops.
    // Avoid aggressive geometry/move commands that can place some terminals offscreen.
    out.write('\x1b[?1049h');   // alternate screen buffer
    out.write('\x1b[2J');       // clear viewport
    out.write('\x1b[H');        // cursor home
    out.write('\x1b[9;1t');     // maximize window
    out.write('\x1b[10;1t');    // request fullscreen mode where supported
    requestNativeFullscreen();
  }

  return () => {
    if (!process.stdout.isTTY) {
      return;
    }
    if (supportsWindowOps) {
      out.write('\x1b[10;0t'); // exit fullscreen mode
      out.write('\x1b[9;0t');  // restore maximize state
      out.write('\x1b[?1049l'); // leave alternate screen buffer
    }
    out.write('\x1b[?25h');
  };
}

function resolveTerminalArtLaunchCommand(
  python: string,
  entrypoint: string
): { command: string; args: string[] } {
  // Keep display awake while the scrying terminal runs.
  // Linux systemd-inhibit path.
  if (canUseSystemdInhibit()) {
    return {
      command: 'systemd-inhibit',
      args: [
        '--what=idle:sleep',
        '--mode=block',
        '--why=lmtlss soul scrying terminal',
        python,
        entrypoint,
      ],
    };
  }

  // macOS caffeinate path.
  if (process.platform === 'darwin' && commandExists('caffeinate')) {
    return {
      command: 'caffeinate',
      args: ['-dimsu', python, entrypoint],
    };
  }

  return { command: python, args: [entrypoint] };
}

let fullscreenRequested = false;
let systemdInhibitAvailable: boolean | null = null;

function requestNativeFullscreen(): void {
  if (fullscreenRequested) {
    return;
  }
  fullscreenRequested = true;

  // Best effort: trigger actual window fullscreen via F11 on Linux/X11.
  // If unavailable, we still keep the ANSI fullscreen request above.
  if (process.platform === 'linux' && process.env.DISPLAY && commandExists('xdotool')) {
    spawnSync('xdotool', ['key', '--clearmodifiers', 'F11'], {
      stdio: 'ignore',
    });
  }
}

function canUseSystemdInhibit(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  if (isWslEnvironment()) {
    return false;
  }
  if (systemdInhibitAvailable != null) {
    return systemdInhibitAvailable;
  }
  if (!commandExists('systemd-inhibit')) {
    systemdInhibitAvailable = false;
    return false;
  }

  // Guard against environments where the binary exists but cannot connect
  // to a running systemd/logind session bus.
  const probe = spawnSync(
    'systemd-inhibit',
    ['--what=idle:sleep', '--mode=block', '--why=lmtlss soul probe', 'true'],
    { stdio: 'ignore', timeout: 1500 }
  );
  systemdInhibitAvailable = (probe.status ?? 1) === 0;
  return systemdInhibitAvailable;
}

function isWslEnvironment(): boolean {
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    return true;
  }
  try {
    const content = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    return content.includes('microsoft');
  } catch {
    return false;
  }
}

function commandExists(command: string): boolean {
  const result = spawnSync('bash', ['-lc', `command -v ${command} >/dev/null 2>&1`], {
    stdio: 'ignore',
  });
  return (result.status ?? 1) === 0;
}

function terminalSupportsWindowOps(): boolean {
  const term = (process.env.TERM ?? '').toLowerCase();
  const termProgram = (process.env.TERM_PROGRAM ?? '').toLowerCase();

  return (
    term.includes('xterm') ||
    term.includes('screen') ||
    term.includes('tmux') ||
    term.includes('kitty') ||
    termProgram.includes('wezterm') ||
    termProgram.includes('iterm') ||
    termProgram.includes('vscode')
  );
}

function once(fn: () => void): () => void {
  let called = false;
  return () => {
    if (called) {
      return;
    }
    called = true;
    fn();
  };
}

function bindChildEvent(
  child: { on?: Function; once?: Function },
  event: string,
  handler: () => void
): void {
  if (typeof child.once === 'function') {
    child.once(event, handler);
    return;
  }
  if (typeof child.on === 'function') {
    child.on(event, handler);
  }
}
