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

/**
 * Backward-compatible epigraph export used by the package entrypoint.
 */
export const EPIGRAPH = BRAND.tagline;

/**
 * Primary brand color (terminal green).
 */
export const soulColor = chalk.hex(BRAND.color);

/**
 * Secondary/accent color for errors.
 */
export const errorColor = chalk.redBright;

/**
 * Warning color.
 */
export const warnColor = chalk.yellowBright;

/**
 * Success color (brand green implies system functioning).
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

// ── Block letter art for "lmtlss soul" ────────────────────────────────────────
// Each letter width (chars): l=2 m=3 t=3 l=2 s=3 s=3 [2sp] s=3 o=3 u=3 l=2
// 1 space between consecutive letters, 2 spaces between words.
// Total width: 37 chars per row.
//
// Letters (4 rows each):
//   l: █ / █ / █ / ██           m: █ █/███/█ █/█ █
//   t: ███/ █ / █ / █           s: ██ /█  /███/ ██
//   o: ███/█ █/█ █/███          u: █ █/█ █/█ █/███
//
const ART: readonly string[] = [
  '█  █ █ ███ █  ██  ██   ██  ███ █ █ █ ',
  '█  ███  █  █  █    █    █   █ █ █ █ █ ',
  '█  █ █  █  █  ███ ███  ███ █ █ █ █ █ ',
  '██ █ █  █  ██  ██  ██    ██ ███ ███ ██',
];

// ── ASCII crystal ball (centered at col 19 over 37-char art) ──────────────────
// The orb is made of dot-arcs, a reflection glyph ∴ at the top,
// the soul-eye ◉ at center, and triple-tilde ≋ shimmer at the base.
const BALL: readonly string[] = [
  "              · ˚ · ˚ ·",
  "            ·'    ∴    '·",
  "            ·  ·  ◉  ·  ·",
  "            ·'  ≋≋≋≋≋  '·",
  "              · ˚ · ˚ ·",
];

const TAGLINE = '              presence.';

/**
 * Returns a static snapshot of the banner (fully lit).
 * For the animated boot sequence use printBanner().
 */
export function getBanner(): string {
  const d = dimColor;
  const g = soulColor.bold;

  const ballLines = BALL.map((line, i) =>
    i === 2
      ? d('            ·  ·  ') + soulColor('◉') + d('  ·  ·')
      : d(line)
  );

  return [
    '',
    ...ballLines,
    ...ART.map(row => g(row)),
    '',
    d(TAGLINE),
    '',
  ].join('\n');
}

/**
 * Prints the animated boot banner.
 * Phase 1: crystal ball flickers to life.
 * Phase 2: a bright wave scans left-to-right across the block letters,
 *           lighting each one from within — cyberpunk ignition sequence.
 * Falls back to static getBanner() in non-TTY environments.
 */
export async function printBanner(): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stdout.write(getBanner() + '\n');
    return;
  }

  // Raw ANSI color codes (faster than chalk in tight animation loops)
  const G   = '\x1b[38;2;74;246;38m';       // brand green
  const GB  = '\x1b[1;38;2;210;255;170m';   // wave peak — bright green-white
  const GG  = '\x1b[38;2;120;220;80m';      // glow tail/pre-glow
  const GD  = '\x1b[2;38;2;28;72;14m';      // unlit — very dim green
  const DIM = '\x1b[2;38;2;55;95;38m';      // ball/tagline dim green
  const EYE = '\x1b[1;38;2;74;246;38m';     // soul-eye lit
  const R   = '\x1b[0m';

  const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

  // Pre-composed ball line strings (dim and lit variants)
  const ballDim: string[] = BALL.map((line, i) =>
    i === 2
      ? `${DIM}            ·  ·  ${R}${G}◉${R}${DIM}  ·  ·${R}`
      : `${DIM}${line}${R}`
  );
  const ballLit: string[] = BALL.map((line, i) =>
    i === 2
      ? `${G}            ·  ·  ${R}${EYE}◉${R}${G}  ·  ·${R}`
      : `${G}${line}${R}`
  );

  const presenceLine = `${DIM}${TAGLINE}${R}`;

  /**
   * Color a single block character based on its distance from the wave front.
   * dist = charIndex - wavePos:
   *   negative → behind the wave (already lit)
   *   zero     → wave peak
   *   positive → ahead of wave (unlit)
   */
  const colorChar = (ch: string, dist: number): string => {
    if (ch === ' ') return ch;
    if (dist <= -3) return G + ch + R;   // fully lit
    if (dist === -2) return GG + ch + R; // glow tail
    if (dist <= 0)   return GB + ch + R; // peak
    if (dist === 1)  return GG + ch + R; // pre-glow
    return GD + ch + R;                   // unlit
  };

  const renderRow = (row: string, wavePos: number): string =>
    [...row].map((ch, i) => colorChar(ch, i - wavePos)).join('');

  // Total printed lines per frame:
  // blank + 5 ball + 4 art + blank + presence + blank = 13
  const TOTAL = 13;

  const printFrame = (ball: string[], wavePos: number): void => {
    let out = '\n';
    for (const line of ball) out += line + '\n';
    for (const row of ART)   out += renderRow(row, wavePos) + '\n';
    out += '\n' + presenceLine + '\n\n';
    process.stdout.write(out);
  };

  const redraw = (ball: string[], wavePos: number): void => {
    process.stdout.write(`\x1b[${TOTAL}A\r`);
    printFrame(ball, wavePos);
  };

  // ── Boot ────────────────────────────────────────────────────────────────────
  process.stdout.write('\x1b[?25l'); // hide cursor
  printFrame(ballDim, -10);          // initial: everything dark

  // Phase 1 — crystal ball ignition flicker (6 pulses)
  for (let i = 0; i < 6; i++) {
    await sleep(55);
    redraw(i % 2 === 0 ? ballLit : ballDim, -10);
  }
  await sleep(90);

  // Phase 2 — wave sweeps left to right across the block letters
  for (let wavePos = -3; wavePos <= 40; wavePos++) {
    redraw(ballLit, wavePos);
    await sleep(21);
  }

  // Final — all lit, steady state
  process.stdout.write(`\x1b[${TOTAL}A\r`);
  let finalOut = '\n';
  for (const line of ballLit) finalOut += line + '\n';
  for (const row of ART)      finalOut += G + row + R + '\n';
  finalOut += '\n' + presenceLine + '\n\n';
  process.stdout.write(finalOut);

  process.stdout.write('\x1b[?25h'); // restore cursor
}

/**
 * Backward-compatible banner export used by the package entrypoint.
 */
export const BANNER = getBanner();
