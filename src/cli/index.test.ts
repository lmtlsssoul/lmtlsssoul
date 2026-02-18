import { describe, it, expect } from 'vitest';
import { main } from './index.js'; // Vitest handles .js for .ts files correctly with ts-node/tsx
import { getBanner, BRAND } from '../soul/branding.js';

describe('CLI Entrypoint', () => {
  it('should export a main function', () => {
    expect(typeof main).toBe('function');
  });

  it('banner should contain brand tagline', () => {
    const banner = getBanner();
    expect(banner).toContain(BRAND.tagline);
  });
});
