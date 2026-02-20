import chalk from 'chalk';
import { randomBytes } from 'node:crypto';

/**
 * lmtlss soul branding constants.
 * Authority: CONVENTIONS.md and whitepaper.pdf
 */
export const BRAND = {
  name: 'lmtlss soul',
  color: '#4af626',
  background: '#000000',
  font: 'Ubuntu Bold',
  icon: '◉',
  tagline: 'presence.',
} as const;

/** Backward-compatible epigraph export. */
export const EPIGRAPH = BRAND.tagline;

/** Primary brand color (terminal green). */
export const soulColor = chalk.hex(BRAND.color);

/** Error color. */
export const errorColor = chalk.redBright;

/** Warning color. */
export const warnColor = chalk.yellowBright;

/** Success color. */
export const successColor = soulColor;

/** Muted color for debug/info. */
export const dimColor = chalk.gray;

/** Formats a message with the lmtlss soul brand style. */
export function formatBrand(text: string): string {
  return soulColor(text);
}

/** Logs a message to stdout with the brand prefix. */
export function log(message: string, ...args: unknown[]): void {
  console.log(`${soulColor('◉')} ${message}`, ...args);
}

/** Logs a success message. */
export function success(message: string, ...args: unknown[]): void {
  console.log(`${soulColor('✔')} ${message}`, ...args);
}

/** Logs a warning message. */
export function warn(message: string, ...args: unknown[]): void {
  console.warn(`${warnColor('⚠')} ${message}`, ...args);
}

/** Logs an error message. */
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

// ── Figlet lowercase outline font for "lmtlss soul" ───────────────────────────
// Generated with figlet "Small" font. 6 rows × ~50 chars.
// These are authentic lowercase letterforms — pipes, underscores, slashes.
const TEXT: readonly string[] = [
  "  _           _   _                           _ ",
  " | |         | | | |                         | |",
  " | |_ __ ___ | |_| |___ ___   ___  ___  _   _| |",
  " | | '_ ` _ \\| __| / __/ __| / __|/ _ \\| | | | |",
  " | | | | | | | |_| \\__ \\__ \\ \\__ \\ (_) | |_| | |",
  " |_|_| |_| |_|\\__|_|___/___/ |___/\\___/ \\__,_|_|",
];

// Text column width: max TEXT line is ~50 chars + 2 gap before the ball.
const TEXT_W = 52;

// ── Crystal ball — concentric shade rings for 3D depth ────────────────────────
// 9 rows × 20 chars. Shade tiers build inward: ░ → ▒ → ▓.
// The sphere tapers at top/bottom (7 active chars) and is widest in the
// middle (15 active chars), giving a true spherical silhouette.
const SPHERE: readonly string[] = [
  '      ░░░░░░░       ',  //  6sp + 7(░)      + 7sp  = 20
  '    ░▒▒▒▒▒▒▒▒▒░     ',  //  4sp + 1+9+1     + 5sp  = 20
  '   ░▒▒▓▓▓▓▓▓▓▒▒░    ',  //  3sp + 1+2+7+2+1 + 4sp  = 20
  '  ░▒▒▓▓▓▓▓▓▓▓▓▒▒░   ',  //  2sp + 1+2+9+2+1 + 3sp  = 20
  '  ░▒▓▓▓▓▓▓▓▓▓▓▓▒░   ',  //  2sp + core row  + 3sp  = 20
  '  ░▒▒▓▓▓▓▓▓▓▓▓▒▒░   ',  //  mirror of row 3
  '   ░▒▒▓▓▓▓▓▓▓▒▒░    ',  //  mirror of row 2
  '    ░▒▒▒▒▒▒▒▒▒░     ',  //  mirror of row 1
  '      ░░░░░░░       ',  //  mirror of row 0
];

// ── Crystal ball pedestal ──────────────────────────────────────────────────────
// 3 rows × 20 chars. Widens toward the base for stability.
// Sits directly below SPHERE[8]. Cup rim (9) → body (11) → flat base (13).
const BASE: readonly string[] = [
  '     ▄▄▄▄▄▄▄▄▄      ',  //  5sp + 9(▄)     + 6sp  = 20  (cup rim)
  '    ▐█████████▌     ',  //  4sp + 1+9+1    + 5sp  = 20  (pedestal body)
  '   ▀▀▀▀▀▀▀▀▀▀▀▀▀    ',  //  3sp + 13(▀)    + 4sp  = 20  (flat base)
];

const RIGHT_STACK: readonly string[] = [...SPHERE, ...BASE];
const LEFT_TOP_PADDING = Math.max(0, RIGHT_STACK.length - TEXT.length);
const TOP_FLICKER_ROWS = 4;

// ── Chalk color tiers for getBanner() (static, chalk-based) ───────────────────
const _vdim = chalk.hex('#1b5a0c');  // ░ very dim green glow
const _dim  = chalk.hex('#3a9a1c');  // ▒ medium glow
const _full = soulColor;             // ▓ brand green

function _renderOrbLineCh(line: string): string {
  return [...line].map(ch => {
    if (ch === '░') return _vdim(ch);
    if (ch === '▒') return _dim(ch);
    if (ch === '▓') return _full(ch);
    if ('▄▀▐▌█'.includes(ch)) return soulColor(ch);
    return ch;
  }).join('');
}

/**
 * Returns a static snapshot of the terminal banner (fully lit).
 * Layout: figlet outline text LEFT, crystal ball + pedestal RIGHT.
 * For the animated boot sequence use printBanner().
 */
export function getBanner(): string {
  const g = soulColor.bold;
  const blank = ' '.repeat(TEXT_W);

  const rows: string[] = [''];
  for (let row = 0; row < RIGHT_STACK.length; row++) {
    const textIdx = row - LEFT_TOP_PADDING;
    const left = textIdx >= 0 && textIdx < TEXT.length
      ? g(TEXT[textIdx]) + ' '.repeat(TEXT_W - TEXT[textIdx].length)
      : blank;
    rows.push(left + _renderOrbLineCh(RIGHT_STACK[row]));
  }
  rows.push('');
  return rows.join('\n');
}

/**
 * Prints the animated boot banner to stdout.
 *
 * Layout: figlet outline letters on the LEFT (static, appear immediately in
 * brand green), crystal ball + pedestal on the RIGHT (flickering).
 *
 * Animation — crystal ball ignition:
 *   Only the top cap of the sphere flickers. Pedestal stays stable.
 *   Flicker timings and states are generated from cryptographic randomness.
 *
 * Falls back to static getBanner() in non-TTY environments.
 */
export async function printBanner(): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stdout.write(getBanner() + '\n');
    return;
  }

  // ── Raw ANSI color codes ─────────────────────────────────────────────────────
  const G    = '\x1b[1;38;2;74;246;38m';    // bold brand green (text, always lit)
  const B0   = '\x1b[38;2;12;45;6m';        // unlit / pre-ignition (darkest)
  const B1   = '\x1b[38;2;28;90;14m';       // ░ lit outer glow
  const B2   = '\x1b[38;2;55;165;28m';      // ▒ lit mid glow
  const B3   = '\x1b[38;2;74;246;38m';      // ▓ lit inner = brand green
  const R    = '\x1b[0m';
  const HIDE = '\x1b[?25l';
  const SHOW = '\x1b[?25h';

  const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

  // ── Orb line renderer: lit=false → dark, lit=true → full gradient ───────────
  function renderOrbLine(line: string, lit: boolean): string {
    const [outer, mid, inner, block] = lit
      ? [B1, B2, B3, B3]
      : [B0, B0, B0, B0];
    return [...line].map(ch => {
      if (ch === '░') return outer + ch + R;
      if (ch === '▒') return mid   + ch + R;
      if (ch === '▓') return inner + ch + R;
      if ('▄▀▐▌█'.includes(ch)) return block + ch + R;
      return ch;
    }).join('');
  }

  const blank    = ' '.repeat(TEXT_W);

  // Total lines per frame:
  //   1 blank (breathing room above letters) + 12 stacked rows + 1 blank = 14
  const TOTAL = 14;

  const printFrame = (topRowLitMask: readonly boolean[]): void => {
    const sphereLines = SPHERE.map((line, idx) => {
      const lit = idx < TOP_FLICKER_ROWS ? (topRowLitMask[idx] ?? true) : true;
      return renderOrbLine(line, lit);
    });
    const baseLines = BASE.map((line) => renderOrbLine(line, true));
    const rightLines = [...sphereLines, ...baseLines];

    let out = '\n';
    for (let row = 0; row < rightLines.length; row++) {
      const textIdx = row - LEFT_TOP_PADDING;
      if (textIdx >= 0 && textIdx < TEXT.length) {
        const gap = ' '.repeat(TEXT_W - TEXT[textIdx].length);
        out += G + TEXT[textIdx] + R + gap + rightLines[row] + '\n';
      } else {
        out += blank + rightLines[row] + '\n';
      }
    }
    out += '\n';
    process.stdout.write(out);
  };

  const redraw = (lit: boolean): void => {
    process.stdout.write(`\x1b[${TOTAL}A\r`);
    printFrame(Array(TOP_FLICKER_ROWS).fill(lit));
  };

  // ── Boot sequence ─────────────────────────────────────────────────────────────
  process.stdout.write(HIDE);
  printFrame(Array(TOP_FLICKER_ROWS).fill(false));  // initial: text visible, top cap dark

  // True-random intermittent flicker for the upper cap.
  const flickerWindowMs = 900;
  let elapsed = 0;
  while (elapsed < flickerWindowMs) {
    const frameMs = secureRandomInt(28, 130);
    await sleep(frameMs);
    elapsed += frameMs;

    const rowMask = Array.from({ length: TOP_FLICKER_ROWS }, (_, idx) => {
      // Higher rows flicker more often than lower rows.
      const threshold = 0.26 + (idx * 0.11);
      return secureRandomFloat() > threshold;
    });
    printFrame(rowMask);
  }

  // Settle to steady fully lit sphere.
  await sleep(45);
  redraw(true);

  process.stdout.write(SHOW);
}

function secureRandomFloat(): number {
  const value = randomBytes(4).readUInt32BE(0);
  return value / 0xFFFFFFFF;
}

function secureRandomInt(min: number, max: number): number {
  const span = max - min + 1;
  return min + Math.floor(secureRandomFloat() * span);
}

/** Backward-compatible banner export used by the package entrypoint. */
export const BANNER = getBanner();
