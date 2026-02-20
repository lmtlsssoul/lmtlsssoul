import { Command, CommanderError } from 'commander';
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
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import os from 'node:os';
import { spawn } from 'node:child_process';
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
      await printBanner();
    });

  registerTreasuryCommands(program);

  program.command('birth')
    .description('Start the soul Birth Portal')
    .option('--python <binary>', 'Python runtime binary for the scry portal prelude')
    .action(async (options: { python?: string }) => {
      await launchTerminalArtBlocking(options.python);
      const birthPortal = new SoulBirthPortal();
      await birthPortal.startGenesis();
    });

  program.command('start')
    .description('Start the soul daemon')
    .option('-p, --port <port>', 'Gateway port', '3000')
    .option('-H, --host <host>', 'Gateway host', '127.0.0.1')
    .action(async (options: { port: string; host: string }) => {
      const state = readDaemonState();
      if (state && isProcessAlive(state.pid)) {
        warn(`Daemon already running (pid=${state.pid}) on ${state.host}:${state.port}.`);
        return;
      }

      const host = options?.host ?? '127.0.0.1';
      const port = Number.parseInt(options?.port ?? '3000', 10);
      const entrypoint = resolveDaemonEntrypoint();

      log(`Summoning daemon on ${host}:${port}...`);
      const child = spawn(process.execPath, [entrypoint, 'gateway', 'start', '--host', host, '--port', String(port)], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      if (!child.pid) {
        throw new Error('Failed to start daemon process.');
      }

      writeDaemonState({
        pid: child.pid,
        host,
        port,
        startedAt: new Date().toISOString(),
      });
      success(`Daemon started (pid=${child.pid}).`);
    });

  program.command('stop')
    .description('Stop the soul daemon')
    .action(async () => {
      const state = readDaemonState();
      if (!state) {
        warn('No daemon state file found.');
        return;
      }

      if (isProcessAlive(state.pid)) {
        process.kill(state.pid, 'SIGTERM');
        success(`Daemon process ${state.pid} stopped.`);
      } else {
        warn(`Daemon process ${state.pid} was not running.`);
      }

      removeDaemonState();
    });

  program.command('status')
    .description('Show soul status')
    .action(async () => {
      const stateDir = getStateDir();
      const state = readDaemonState();
      const daemonRunning = state ? isProcessAlive(state.pid) : false;
      const gatewayHealth = state
        ? await getGatewayHealth(state.host, state.port)
        : { ok: false, detail: 'Daemon not started.' };

      const graph = new GraphDB(stateDir);
      const archive = new ArchiveDB(stateDir);

      log('--- Soul Status ---');
      console.log(`State Dir: ${stateDir}`);
      console.log(`Daemon: ${daemonRunning ? `running (pid=${state?.pid})` : 'stopped'}`);
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
    .description('Manage substrate models');

  modelsCommand.command('scan')
    .description('Scan for available models from all substrates')
    .action(async () => {
      log('Scanning for models...');
      const modelsBySubstrate = await scanForModels();
      for (const [substrate, models] of Object.entries(modelsBySubstrate)) {
        console.log(`\n=== ${substrate.toUpperCase()} ===`);
        console.table(models);
      }
      success('Model scan complete.');
    });

  modelsCommand.command('set')
    .description('Set the model for a given role')
    .argument('<role>', 'The role to set the model for (e.g., interface, compiler)')
    .argument('<modelRef>', 'The model reference (<substrate>:<modelId> or unique <modelId>)')
    .action(async (role, modelId) => {
      log(`Assigning model to role...`);
      await setModelForRole(role, modelId);
      success(`Model for role "${role}" set to "${modelId}".`);
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

  program.command('chat')
    .description('Open an interactive terminal conversation with the soul')
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

// ── Interactive Chat ──────────────────────────────────────────────────────────

async function runInteractiveChat(peer: string, channel: string): Promise<void> {
  const stateDir = getStateDir();

  if (!fs.existsSync(path.join(stateDir, 'birth-config.json'))) {
    error('Soul not yet born. Run "soul birth" first.');
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

  throw new Error('Unable to resolve daemon entrypoint (soul.mjs).');
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
  console.log(`Substrate: ${capabilities.substrate}`);
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
    child.on('exit', () => {
      resolve();
    });
  });
}

function spawnTerminalArtProcess(pythonOverride?: string) {
  const entrypoint = resolveTerminalArtEntrypoint();
  const python = (pythonOverride?.trim() || process.env.SOUL_ART_PYTHON?.trim() || 'python3');
  log(`Launching terminal art from ${entrypoint}`);
  const restoreViewport = enterTerminalArtViewport();

  const child = spawn(python, [entrypoint], {
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
  const homeInstall = path.resolve(os.homedir(), '.lmtlss/src/terminalart/art.6.py');
  const candidates = [
    // Canonical install location (always prefer current installed art).
    homeInstall,
    // Source layout: src/cli/index.ts -> ../../terminalart/art.6.py
    path.resolve(moduleDir, '../../terminalart/art.6.py'),
    // Bundled layout: dist/index.js -> ../terminalart/art.6.py
    path.resolve(moduleDir, '../terminalart/art.6.py'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Unable to resolve terminal art entrypoint (terminalart/art.6.py).');
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
    // Best-effort maximize/edge pin (xterm window ops).
    out.write('\x1b[9;1t'); // maximize
    out.write('\x1b[3;0;0t'); // move top-left
  }

  return () => {
    if (!process.stdout.isTTY) {
      return;
    }
    if (supportsWindowOps) {
      out.write('\x1b[9;0t'); // restore from maximize/fullscreen mode
    }
    out.write('\x1b[?25h');
  };
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
