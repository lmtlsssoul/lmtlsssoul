/**
 * @file src/soul/weights.ts
 * @description
 *   Weight vector operations for the Soul graph. These functions implement the
 *   core learning and adaptation mechanics of the soul by modifying the
 *   six-dimensional weight vectors on nodes.
 * @authoreb eebee
 * @see whitepaper.pdf, Section 4.2 (Node Weight Vector)
 */

import { WeightVector } from './types.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default reinforcement factor. */
const REINFORCE_FACTOR = 0.1;
/** Default contradiction factor. */
const CONTRADICT_FACTOR = 0.2;
/** Default decay factor. */
const DECAY_FACTOR = 0.01;
/** Default capsule promotion factor. */
const CAPSULE_PROMOTION_FACTOR = 0.05;
/** The minimum and maximum values for each weight dimension. */
export const WEIGHT_RANGES: Record<keyof WeightVector, [number, number]> = {
  salience: [0.0, 1.0],
  valence: [-1.0, 1.0],
  arousal: [0.0, 1.0],
  commitment: [0.0, 1.0],
  uncertainty: [0.0, 1.0],
  resonance: [0.0, 1.0],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Clamps a value to the specified min and max.
 * @param value The value to clamp.
 * @param min The minimum allowed value.
 * @param max The maximum allowed value.
 * @returns The clamped value.
 */
const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

/**
 * Clamps a weight vector to its prescribed min/max values.
 * @param vector The weight vector to clamp.
 * @returns A new, clamped weight vector.
 */
export const clampVector = (vector: WeightVector): WeightVector => {
  const clamped: Partial<WeightVector> = {};
  for (const key in vector) {
    const k = key as keyof WeightVector;
    const [min, max] = WEIGHT_RANGES[k];
    clamped[k] = clamp(vector[k], min, max);
  }
  return clamped as WeightVector;
};

// ─── Operations ───────────────────────────────────────────────────────────────

/**
 * Applies reinforcement to a weight vector.
 * Increases salience, arousal, and commitment. Decreases uncertainty.
 * Valence is pushed further from zero.
 * @param vector The original weight vector.
 * @returns A new, reinforced weight vector.
 */
export const reinforce = (vector: WeightVector): WeightVector => {
  const newVector: WeightVector = { ...vector };

  newVector.salience += REINFORCE_FACTOR;
  newVector.arousal += REINFORCE_FACTOR;
  newVector.commitment += REINFORCE_FACTOR;
  newVector.uncertainty -= REINFORCE_FACTOR;
  newVector.valence += Math.sign(newVector.valence) * REINFORCE_FACTOR;

  return clampVector(newVector);
};

/**
 * Applies contradiction to a weight vector.
 * Increases salience, arousal, and uncertainty.
 * Sharply decreases commitment and flips valence.
 * @param vector The original weight vector.
 * @returns A new, contradicted weight vector.
 */
export const contradict = (vector: WeightVector): WeightVector => {
  const newVector: WeightVector = { ...vector };

  newVector.salience += CONTRADICT_FACTOR;
  newVector.arousal += CONTRADICT_FACTOR;
  newVector.uncertainty += CONTRADICT_FACTOR * 2; // Contradiction breeds uncertainty
  newVector.commitment -= CONTRADICT_FACTOR * 2; // Sharply reduces commitment
  newVector.valence *= -1; // Flip valence

  return clampVector(newVector);
};

/**
 * Applies decay to a weight vector.
 * Periodically reduces salience and arousal.
 * @param vector The original weight vector.
 * @returns A new, decayed weight vector.
 */
export const decay = (vector: WeightVector): WeightVector => {
  const newVector: WeightVector = { ...vector };

  newVector.salience -= DECAY_FACTOR;
  newVector.arousal -= DECAY_FACTOR;

  return clampVector(newVector);
};

/**
 * Applies a promotion boost to a weight vector.
 * Occurs when a node is included in a Soul Capsule.
 * Increases resonance and commitment.
 * @param vector The original weight vector.
 * @returns A new, promoted weight vector.
 */
export const capsulePromotion = (vector: WeightVector): WeightVector => {
  const newVector: WeightVector = { ...vector };

  newVector.resonance += CAPSULE_PROMOTION_FACTOR;
  newVector.commitment += CAPSULE_PROMOTION_FACTOR;
  newVector.salience += CAPSULE_PROMOTION_FACTOR;

  return clampVector(newVector);
};

/**
 * Updates the resonance of a node based on its connections.
 * Uses a deterministic lightweight update driven by connected-node salience.
 * @param vector The original weight vector.
 * @param connectedSalience The average salience of connected nodes.
 * @returns A new weight vector with updated resonance.
 */
export const updateResonance = (
  vector: WeightVector,
  connectedSalience: number
): WeightVector => {
  const newVector: WeightVector = { ...vector };

  // Simple model: resonance moves towards the average salience of its neighbors.
  const resonanceChange = (connectedSalience - newVector.resonance) * 0.1;
  newVector.resonance += resonanceChange;

  return clampVector(newVector);
};
