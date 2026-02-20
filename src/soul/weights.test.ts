/**
 * @file src/soul/weights.test.ts
 * @description Unit tests for weight vector operations.
 */

import { describe, it, expect } from 'vitest';
import {
  reinforce,
  contradict,
  decay,
  capsulePromotion,
  updateResonance,
  clampVector,
} from './weights.ts';
import { WeightVector } from './types.ts';

describe('Weight Vector Operations', () => {
  const baseVector: WeightVector = {
    salience: 0.5,
    valence: 0.5,
    arousal: 0.5,
    commitment: 0.5,
    uncertainty: 0.5,
    resonance: 0.5,
  };

  it('should clamp a vector to its valid range', () => {
    const vector: WeightVector = {
      salience: 1.5,
      valence: -1.2,
      arousal: -0.1,
      commitment: 1.1,
      uncertainty: -0.5,
      resonance: 2.0,
    };
    const clamped = clampVector(vector);
    expect(clamped.salience).toBe(1.0);
    expect(clamped.valence).toBe(-1.0);
    expect(clamped.arousal).toBe(0.0);
    expect(clamped.commitment).toBe(1.0);
    expect(clamped.uncertainty).toBe(0.0);
    expect(clamped.resonance).toBe(1.0);
  });

  it('should reinforce a vector correctly', () => {
    const reinforced = reinforce(baseVector);
    expect(reinforced.salience).toBeCloseTo(0.6);
    expect(reinforced.valence).toBeCloseTo(0.6);
    expect(reinforced.arousal).toBeCloseTo(0.6);
    expect(reinforced.commitment).toBeCloseTo(0.6);
    expect(reinforced.uncertainty).toBeCloseTo(0.4);
    expect(reinforced.resonance).toBe(0.5); // unchanged
  });

  it('should handle reinforcement at the upper bound', () => {
    const vector: WeightVector = { ...baseVector, salience: 1.0, valence: 1.0 };
    const reinforced = reinforce(vector);
    expect(reinforced.salience).toBe(1.0);
    expect(reinforced.valence).toBe(1.0);
  });

  it('should contradict a vector correctly', () => {
    const contradicted = contradict(baseVector);
    expect(contradicted.salience).toBeCloseTo(0.7);
    expect(contradicted.valence).toBeCloseTo(-0.5); // flipped
    expect(contradicted.arousal).toBeCloseTo(0.7);
    expect(contradicted.commitment).toBeCloseTo(0.1); // 0.5 - 0.2*2
    expect(contradicted.uncertainty).toBeCloseTo(0.9); // 0.5 + 0.2*2
    expect(contradicted.resonance).toBe(0.5); // unchanged
  });

  it('should handle contradiction at the lower bound', () => {
    const vector: WeightVector = { ...baseVector, commitment: 0.1 };
    const contradicted = contradict(vector);
    expect(contradicted.commitment).toBe(0.0);
  });

  it('should decay a vector correctly', () => {
    const decayed = decay(baseVector);
    expect(decayed.salience).toBeCloseTo(0.49);
    expect(decayed.arousal).toBeCloseTo(0.49);
    // Other values should be unchanged
    expect(decayed.valence).toBe(0.5);
    expect(decayed.commitment).toBe(0.5);
    expect(decayed.uncertainty).toBe(0.5);
    expect(decayed.resonance).toBe(0.5);
  });

  it('should handle decay at the lower bound', () => {
    const vector: WeightVector = { ...baseVector, salience: 0.0, arousal: 0.0 };
    const decayed = decay(vector);
    expect(decayed.salience).toBe(0.0);
    expect(decayed.arousal).toBe(0.0);
  });

  it('should apply capsule promotion correctly', () => {
    const promoted = capsulePromotion(baseVector);
    expect(promoted.resonance).toBeCloseTo(0.55);
    expect(promoted.commitment).toBeCloseTo(0.55);
    expect(promoted.salience).toBeCloseTo(0.55);
    // Other values should be unchanged
    expect(promoted.valence).toBe(0.5);
    expect(promoted.arousal).toBe(0.5);
    expect(promoted.uncertainty).toBe(0.5);
  });

  it('should update resonance based on connected salience', () => {
    // Test case 1: Resonance should increase towards connected salience
    const connectedSalienceHigh = 0.8;
    const resonated1 = updateResonance(baseVector, connectedSalienceHigh);
    // resonance change = (0.8 - 0.5) * 0.1 = 0.03. New resonance = 0.53
    expect(resonated1.resonance).toBeCloseTo(0.53);

    // Test case 2: Resonance should decrease towards connected salience
    const connectedSalienceLow = 0.2;
    const resonated2 = updateResonance(baseVector, connectedSalienceLow);
    // resonance change = (0.2 - 0.5) * 0.1 = -0.03. New resonance = 0.47
    expect(resonated2.resonance).toBeCloseTo(0.47);
  });
});
