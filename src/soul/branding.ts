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

// ── Solid lowercase pixel art for "lmtlss soul" ───────────────────────────────
// 5 rows × 39 chars. Uses █ ▀ ▄ ▐ ▌ for solid fills that preserve
// lowercase letterforms. Key signals:
//   l : thin vertical + base foot (tall, clearly l)
//   m : ▐█▐█▌ arch-top / three-pillar body (two-hump lowercase m)
//   t : stem above crossbar (row 1 = stem, row 2 = ███ crossbar) ← NOT capital T
//   s : top-bar/left/mid/right/bottom (Z-curve)
//   o : ▄█▄ top + ▀█▀ bottom (oval, not box)
//   u : open top, ▀█▀ closed base + empty row 5 (x-height only)
// Letter widths: l=2  m=5  t=3  l=2  s=3  s=3  [2sp]  s=3  o=3  u=3  l=2
// Total: 39 chars per row.
const ART: readonly string[] = [
  '█  ▐█▐█▌  █  █  ██  ██   ██  ▄█▄ █ █ █ ',
  '█  █ █ █ ███ █  █    █    █   █ █ █ █ █ ',
  '█  █   █  █  █  ███ ███  ███ █ █ █ █ █ ',
  '█  █   █  █  █    █    █     █ █ ▀█▀ █ ',
  '██ █   █  ██ ██  ██  ██    ██ ▀█▀    ██',
];

// ── ASCII crystal ball ─────────────────────────────────────────────────────────
// Concentric shade-block rings (░ ▒ ▓) produce depth and luminous glow.
// ◉ at center = the soul's eye. Centered at col 20 over 39-char art.
const BALL: readonly string[] = [
  '               ░░░░░░░░░',
  '              ░▒▒▒▒▒▒▒▒▒░',
  '             ░▒▒▓▓▓▓▓▓▓▒▒░',
  '             ░▒▓▓▓▓◉▓▓▓▓▒░',
  '             ░▒▒▓▓▓▓▓▓▓▒▒░',
  '              ░▒▒▒▒▒▒▒▒▒░',
  '               ░░░░░░░░░',
];

const TAGLINE = '               presence.';

// Chalk color tiers for the orb gradient (static banner)
const _vdim = chalk.hex('#1b5a0c');  // ░ very dim green glow
const _dim  = chalk.hex('#3a9a1c');  // ▒ medium glow
const _full = soulColor;             // ▓ brand green
const _eye  = soulColor.bold;        // ◉ soul-eye (brightest)

function _renderBallLine(line: string): string {
  return [...line].map(ch => {
    if (ch === '░') return _vdim(ch);
    if (ch === '▒') return _dim(ch);
    if (ch === '▓') return _full(ch);
    if (ch === '◉') return _eye(ch);
    return ch;
  }).join('');
}

/**
 * Returns a static snapshot of the terminal banner (fully lit).
 * For the animated boot sequence use printBanner().
 */
export function getBanner(): string {
  const g = soulColor.bold;
  return [
    '',
    ...BALL.map(_renderBallLine),
    ...ART.map(row => g(row)),
    '',
    dimColor(TAGLINE),
    '',
  ].join('\n');
}

/**
 * Prints the animated boot banner to stdout.
 *
 * Phase 1 — crystal ball ignition: the orb flickers from dark to glowing,
 *   shade rings lighting up (░ → ▒ → ▓ → ◉) like a real crystal ball powering on.
 * Phase 2 — wave scan: a bright green wave sweeps left→right across the solid
 *   pixel letters, each character lighting up from within as it passes.
 *
 * Falls back to static getBanner() in non-TTY environments.
 */
export async function printBanner(): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stdout.write(getBanner() + '\n');
    return;
  }

  // ── Raw ANSI color codes ─────────────────────────────────────────────────────
  const G    = '\x1b[38;2;74;246;38m';      // brand green (fully lit)
  const GB   = '\x1b[1;38;2;210;255;160m';  // wave peak — bright green-white
  const GG   = '\x1b[38;2;120;220;80m';     // glow tail
  const GD   = '\x1b[2;38;2;28;72;14m';     // unlit — very dim

  // Crystal ball shade tiers
  const B0   = '\x1b[38;2;12;45;6m';        // ░ pre-ignition (darkest)
  const B1   = '\x1b[38;2;28;90;14m';       // ░ lit outer glow
  const B2   = '\x1b[38;2;55;165;28m';      // ▒ lit mid glow
  const B3   = '\x1b[38;2;74;246;38m';      // ▓ lit inner (brand green)
  const BEYE = '\x1b[1;38;2;200;255;140m';  // ◉ soul-eye (brightest)

  const R    = '\x1b[0m';
  const HIDE = '\x1b[?25l';
  const SHOW = '\x1b[?25h';

  const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

  // ── Pre-compose ball line strings ────────────────────────────────────────────
  function renderBallLine(line: string, tier: 0 | 1): string {
    const outer = tier === 0 ? B0 : B1;
    const mid   = tier === 0 ? B0 : B2;
    const inner = tier === 0 ? B0 : B3;
    const eye   = tier === 0 ? B0 : BEYE;
    return [...line].map(ch => {
      if (ch === '░') return outer + ch + R;
      if (ch === '▒') return mid   + ch + R;
      if (ch === '▓') return inner + ch + R;
      if (ch === '◉') return eye   + ch + R;
      return ch;
    }).join('');
  }

  const ballDim = BALL.map(l => renderBallLine(l, 0));
  const ballLit = BALL.map(l => renderBallLine(l, 1));

  const presenceLine = `${B1}${TAGLINE}${R}`;

  // ── Wave coloriser ────────────────────────────────────────────────────────────
  const colorChar = (ch: string, dist: number): string => {
    if (ch === ' ') return ch;
    if (dist <= -3) return G  + ch + R;
    if (dist === -2) return GG + ch + R;
    if (dist <= 0)   return GB + ch + R;
    if (dist === 1)  return GG + ch + R;
    return GD + ch + R;
  };

  const renderRow = (row: string, wavePos: number): string =>
    [...row].map((ch, i) => colorChar(ch, i - wavePos)).join('');

  // Total lines per frame: blank + 7 ball + 5 art + blank + presence + blank = 16
  const TOTAL = 16;

  const printFrame = (ball: string[], wavePos: number): void => {
    let out = '\n';
    for (const line of ball) out += line + '\n';
    for (const row of ART)  out += renderRow(row, wavePos) + '\n';
    out += '\n' + presenceLine + '\n\n';
    process.stdout.write(out);
  };

  const redraw = (ball: string[], wavePos: number): void => {
    process.stdout.write(`\x1b[${TOTAL}A\r`);
    printFrame(ball, wavePos);
  };

  // ── Boot sequence ─────────────────────────────────────────────────────────────
  process.stdout.write(HIDE);
  printFrame(ballDim, -10);    // initial: everything dark

  // Phase 1: crystal ball flickers to life (8 pulses)
  for (let i = 0; i < 8; i++) {
    await sleep(50);
    redraw(i % 2 === 0 ? ballLit : ballDim, -10);
  }
  await sleep(80);

  // Phase 2: bright wave scans left → right across pixel letters
  for (let wavePos = -3; wavePos <= 42; wavePos++) {
    redraw(ballLit, wavePos);
    await sleep(21);
  }

  // Final: everything steady
  process.stdout.write(`\x1b[${TOTAL}A\r`);
  let out = '\n';
  for (const line of ballLit) out += line + '\n';
  for (const row of ART)      out += G + row + R + '\n';
  out += '\n' + presenceLine + '\n\n';
  process.stdout.write(out);

  process.stdout.write(SHOW);
}

/** Backward-compatible banner export used by the package entrypoint. */
export const BANNER = getBanner();
