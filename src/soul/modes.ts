import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getStateDir } from './types.ts';

export type GrownupModeState = {
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
};

export type GrownupCapabilities = {
  grownupMode: boolean;
  selfOptimize: boolean;
  selfAuthor: boolean;
  rootIntent: boolean;
  rootAccessActive: boolean;
  privilegeLevel: 'standard' | 'root';
  currentPrivilege: PermissionDepth;
  deepestPrivilege: PermissionDepth;
  substrate: PermissionSubstrate;
  cloud: boolean;
  escalationStrategy: EscalationStrategy;
  notes: string[];
};

export type PermissionDepth = 'standard' | 'root';
export type PermissionSubstrate = 'linux' | 'macos' | 'windows' | 'wsl' | 'unknown';
export type EscalationStrategy = 'none' | 'sudo' | 'windows_admin';

export type DeepPermissionScan = {
  substrate: PermissionSubstrate;
  cloud: boolean;
  currentPrivilege: PermissionDepth;
  deepestPrivilege: PermissionDepth;
  escalationStrategy: EscalationStrategy;
  notes: string[];
};

export function getGrownupModePath(stateDir = getStateDir()): string {
  return path.join(stateDir, 'grownup-mode.json');
}

export function readGrownupMode(stateDir = getStateDir()): GrownupModeState {
  const modePath = getGrownupModePath(stateDir);
  if (!fs.existsSync(modePath)) {
    return defaultModeState();
  }

  try {
    const raw = JSON.parse(fs.readFileSync(modePath, 'utf-8')) as Partial<GrownupModeState>;
    if (typeof raw.enabled !== 'boolean') {
      return defaultModeState();
    }

    return {
      enabled: raw.enabled,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
      updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : '',
    };
  } catch {
    return defaultModeState();
  }
}

export function setGrownupMode(
  enabled: boolean,
  options?: { stateDir?: string; updatedBy?: string }
): GrownupModeState {
  const stateDir = options?.stateDir ?? getStateDir();
  const modePath = getGrownupModePath(stateDir);
  const next: GrownupModeState = {
    enabled,
    updatedAt: new Date().toISOString(),
    updatedBy: options?.updatedBy ?? 'author_cli',
  };

  fs.mkdirSync(path.dirname(modePath), { recursive: true });
  fs.writeFileSync(modePath, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

export function deriveGrownupCapabilities(
  mode: GrownupModeState,
  options?: { scan?: DeepPermissionScan }
): GrownupCapabilities {
  const scan = options?.scan ?? scanDeepestPermissions();
  const grownupMode = mode.enabled;
  const rootAccessActive = grownupMode && scan.deepestPrivilege === 'root';

  return {
    grownupMode,
    selfOptimize: grownupMode,
    selfAuthor: grownupMode,
    rootIntent: grownupMode,
    rootAccessActive,
    privilegeLevel: rootAccessActive ? 'root' : 'standard',
    currentPrivilege: scan.currentPrivilege,
    deepestPrivilege: scan.deepestPrivilege,
    substrate: scan.substrate,
    cloud: scan.cloud,
    escalationStrategy: scan.escalationStrategy,
    notes: [...scan.notes],
  };
}

export function scanDeepestPermissions(): DeepPermissionScan {
  const substrate = detectSubstrate();
  const cloud = detectCloudEnvironment();
  const notes: string[] = [];

  if (substrate === 'windows') {
    return scanWindowsPermissions(cloud, notes);
  }

  if (isRootProcess()) {
    notes.push('Process is already running as root.');
    return {
      substrate,
      cloud,
      currentPrivilege: 'root',
      deepestPrivilege: 'root',
      escalationStrategy: 'none',
      notes,
    };
  }

  if (canSudoWithoutPrompt()) {
    notes.push('Passwordless sudo is available for delegated root operations.');
    return {
      substrate,
      cloud,
      currentPrivilege: 'standard',
      deepestPrivilege: 'root',
      escalationStrategy: 'sudo',
      notes,
    };
  }

  notes.push('No non-interactive root path detected.');
  return {
    substrate,
    cloud,
    currentPrivilege: 'standard',
    deepestPrivilege: 'standard',
    escalationStrategy: 'none',
    notes,
  };
}

function defaultModeState(): GrownupModeState {
  return {
    enabled: false,
    updatedAt: '',
    updatedBy: '',
  };
}

function isRootProcess(): boolean {
  if (typeof process.getuid !== 'function') {
    return false;
  }

  return process.getuid() === 0;
}

function detectSubstrate(): PermissionSubstrate {
  if (process.platform === 'win32') {
    return 'windows';
  }
  if (process.platform === 'darwin') {
    return 'macos';
  }
  if (process.platform === 'linux') {
    if (isWslEnvironment()) {
      return 'wsl';
    }
    return 'linux';
  }
  return 'unknown';
}

function isWslEnvironment(): boolean {
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    return true;
  }

  const versionFile = '/proc/version';
  if (!fs.existsSync(versionFile)) {
    return false;
  }

  try {
    const version = fs.readFileSync(versionFile, 'utf-8').toLowerCase();
    return version.includes('microsoft');
  } catch {
    return false;
  }
}

function detectCloudEnvironment(): boolean {
  const markers = [
    'AWS_EXECUTION_ENV',
    'K_SERVICE',
    'FUNCTION_TARGET',
    'GCP_PROJECT',
    'WEBSITE_INSTANCE_ID',
    'DYNO',
    'FLY_APP_NAME',
    'VERCEL',
    'RAILWAY_ENVIRONMENT',
  ];

  return markers.some((marker) => Boolean(process.env[marker]));
}

function scanWindowsPermissions(cloud: boolean, notes: string[]): DeepPermissionScan {
  const admin = isWindowsAdmin();
  if (admin) {
    notes.push('Administrator token is active in this process.');
    return {
      substrate: 'windows',
      cloud,
      currentPrivilege: 'root',
      deepestPrivilege: 'root',
      escalationStrategy: 'none',
      notes,
    };
  }

  if (isCommandAvailable('runas')) {
    notes.push('runas is available for privileged relaunch.');
    return {
      substrate: 'windows',
      cloud,
      currentPrivilege: 'standard',
      deepestPrivilege: 'root',
      escalationStrategy: 'windows_admin',
      notes,
    };
  }

  notes.push('No Administrator token or relaunch path detected.');
  return {
    substrate: 'windows',
    cloud,
    currentPrivilege: 'standard',
    deepestPrivilege: 'standard',
    escalationStrategy: 'none',
    notes,
  };
}

function canSudoWithoutPrompt(): boolean {
  if (!isCommandAvailable('sudo')) {
    return false;
  }

  const result = spawnSync('sudo', ['-n', 'true'], { stdio: 'ignore' });
  return result.status === 0;
}

function isWindowsAdmin(): boolean {
  const shell = resolvePowershellBinary();
  if (!shell) {
    return false;
  }

  const script =
    '([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent())' +
    '.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)';
  const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  return result.status === 0 && String(result.stdout).trim().toLowerCase() === 'true';
}

function resolvePowershellBinary(): string | null {
  if (isCommandAvailable('pwsh')) {
    return 'pwsh';
  }
  if (isCommandAvailable('powershell')) {
    return 'powershell';
  }
  return null;
}

function isCommandAvailable(command: string): boolean {
  const checkCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checkCommand, [command], { stdio: 'ignore' });
  return result.status === 0;
}
