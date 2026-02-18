import { Command, CommanderError } from 'commander';
import { getBanner, log, error, success, warn } from '../soul/branding.ts';
import { SoulBirthPortal } from '../soul/birth.ts';
import { scanForModels, setModelForRole } from '../soul/models-scan.js';
import { GatewayServer } from '../gateway/server.ts';
import { registerTreasuryCommands } from './treasury.ts';
import { getStateDir } from '../soul/types.ts';
import { GraphDB } from '../soul/graph-db.ts';
import { ArchiveDB } from '../soul/archive-db.ts';
import { Reflection } from '../agents/reflection.ts';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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
    .hook('preAction', (thisCommand) => {
      // Don't show banner for help command
      if (thisCommand.args[0] === 'help') return;
      // Dont show banner for version command
      const vargs = ['-V', '--version'];
      if(vargs.includes(thisCommand.args[0])) return;
      console.log(getBanner());
    });

  registerTreasuryCommands(program);

  program.command('birth')
    .description('Start the soul Birth Portal')
    .action(async () => {
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
      const entrypoint = path.resolve(process.cwd(), 'soul.mjs');

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
