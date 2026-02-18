/**
 * Branding constants for lmtlss soul.
 * Terminal green on black. Throwback aesthetic.
 *
 * "presence."
 */

/** Core brand constants. */
export const BRAND = {
  name: 'lmtlss soul',
  color: '#4af626',
  background: '#000000',
  font: 'Ubuntu Bold',
  icon: 'crystal ball',
  tagline: 'presence.',
  repo: 'github.com/lmtlsssoul/lmtlsssoul',
  year: 2026,
} as const;

/** The epigraph from the whitepaper. */
export const EPIGRAPH = [
  '"entropy in the cosmos is like the ocean',
  ' Soul is a limitless coastline reshaped by countless waves',
  ' each new moment is a fresh wave from which form emerges"',
] as const;

/** ASCII art banner for terminal display. */
export const BANNER = `
\x1b[38;2;74;246;38m  _           _   _                           _
 | |_ __ ___ | |_| |___ ___   ___  ___  _   _| |
 | | '_ \` _ \\| __| / __/ __| / __|/ _ \\| | | | |
 | | | | | | | |_| \\__ \\__ \\ \\__ \\ (_) | |_| | |
 |_|_| |_| |_|\\__|_|___/___/ |___/\\___/ \\__,_|_|
\x1b[0m
\x1b[38;2;74;246;38m  presence.\x1b[0m
`;
