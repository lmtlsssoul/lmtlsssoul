import { describe, it, expect } from 'vitest';
import { BRAND, getBanner, soulColor } from './branding.js';

describe('Soul Branding', () => {
  it('should export the correct brand constants', () => {
    expect(BRAND.name).toBe('lmtlss soul');
    expect(BRAND.color).toBe('#4af626');
    expect(BRAND.background).toBe('#000000');
    expect(BRAND.icon).toBe('crystal ball');
    expect(BRAND.tagline).toBe('presence.');
  });

  it('should generate a banner string', () => {
    const banner = getBanner();
    expect(banner).toContain('presence.');
    expect(banner).not.toBe('');
  });

  it('should create a styled string', () => {
    const styled = soulColor('test');
    expect(styled).toContain('test');
  });
});
