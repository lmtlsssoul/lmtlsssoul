import chalk from 'chalk';

/**
 * lmtlss soul branding constants.
 * Authority: CONVENTIONS.md and whitepaper.pdf
 */
export const BRAND = {
  name: 'lmtlss soul',
  color: '#4af626',
  background: '#000000',
  font: 'Ubuntu Bold',
  icon: '🔮',
  tagline: 'presence.',
} as const;

/**
 * Backward-compatible epigraph export used by the package entrypoint.
 */
export const EPIGRAPH = BRAND.tagline;

/**
 * Primary brand color (terminal green).
 */
export const soulColor = chalk.hex(BRAND.color);

/**
 * Secondary/accent color for errors (red-ish but fitting).
 * Using a bright red for visibility, though not strictly in brand palette,
 * errors need to pop.
 */
export const errorColor = chalk.redBright;

/**
 * Warning color (yellow-ish).
 */
export const warnColor = chalk.yellowBright;

/**
 * Success color (same as brand or slightly different?).
 * Let's use brand color for success as it implies "system functioning".
 */
export const successColor = soulColor;

/**
 * Muted color for debug/info.
 */
export const dimColor = chalk.gray;

/**
 * Formats a message with the lmtlss soul brand style.
 */
export function formatBrand(text: string): string {
  return soulColor(text);
}

/**
 * Logs a message to stdout with the brand prefix.
 */
export function log(message: string, ...args: unknown[]): void {
  console.log(`${soulColor('◉')} ${message}`, ...args);
}

/**
 * Logs a success message.
 */
export function success(message: string, ...args: unknown[]): void {
  console.log(`${soulColor('✔')} ${message}`, ...args);
}

/**
 * Logs a warning message.
 */
export function warn(message: string, ...args: unknown[]): void {
  console.warn(`${warnColor('⚠')} ${message}`, ...args);
}

/**
 * Logs an error message.
 */
export function error(message: string, error?: unknown): void {
  console.error(`${errorColor('✖')} ${message}`);
  if (error) {
    if (error instanceof Error) {
      console.error(dimColor(error.stack || error.message));
    } else {
      console.error(dimColor(String(error)));
    }
  }
}

/**
 * Returns the ASCII banner for the CLI.
 */
export function getBanner(): string {
  return `
${soulColor('  _           _   _                           _ ')}
${soulColor(' | |         | | | |                         | |')}
${soulColor(' | |_ __ ___ | |_| |___ ___   ___  ___  _   _| |')}
${soulColor(' | | \'_ ` _ \\| __| / __/ __| / __|/ _ \\| | | | |')}
${soulColor(' | | | | | | | |_| \\__ \\__ \\ \\__ \\ (_) | |_| | |')}
${soulColor(' |_|_| |_| |_|\\__|_|___/___/ |___/\\___/ \\__,_|_|')}
${dimColor('                                  ' + BRAND.icon + '  ' + BRAND.tagline)}
`;
}

/**
 * Backward-compatible banner export used by the package entrypoint.
 */
export const BANNER = getBanner();
