import { describe, it, expect } from 'vitest';
import {
  ZODIAC_SIGNS,
  generateAstrologyChart,
  formatAstrologyIdentityImprint,
  type AstrologyInput,
} from './astrology.ts';

describe('astrology chart generation', () => {
  const sampleInput: AstrologyInput = {
    date: '1993-11-03',
    time: '14:32',
    timezoneOffset: '-05:00',
    location: 'Toronto, CA',
    latitude: 43.6532,
    longitude: -79.3832,
  };

  it('generates a deterministic full natal chart payload', () => {
    const chartA = generateAstrologyChart(sampleInput);
    const chartB = generateAstrologyChart(sampleInput);

    expect(chartA.utcIso).toBe(chartB.utcIso);
    expect(chartA.placements).toEqual(chartB.placements);
    expect(chartA.placements).toHaveLength(10);
    expect(chartA.houses).toHaveLength(12);
  });

  it('produces valid sign + house ranges for all placements', () => {
    const chart = generateAstrologyChart(sampleInput);

    for (const placement of chart.placements) {
      expect(ZODIAC_SIGNS).toContain(placement.sign);
      expect(placement.house).toBeGreaterThanOrEqual(1);
      expect(placement.house).toBeLessThanOrEqual(12);
      expect(placement.longitude).toBeGreaterThanOrEqual(0);
      expect(placement.longitude).toBeLessThan(360);
      expect(placement.degreeInSign).toBeGreaterThanOrEqual(0);
      expect(placement.degreeInSign).toBeLessThan(30);
    }

    const imprint = formatAstrologyIdentityImprint(chart);
    expect(imprint).toContain('Big Three:');
    expect(imprint).toContain('Placements:');
    expect(imprint).toContain('Whole-sign houses:');
  });

  it('rejects invalid inputs', () => {
    expect(() => generateAstrologyChart({
      ...sampleInput,
      date: 'not-a-date',
    })).toThrow();

    expect(() => generateAstrologyChart({
      ...sampleInput,
      latitude: 190,
    })).toThrow();
  });
});
