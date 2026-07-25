import { describe, expect, it } from 'vitest';
import { secondsPerShot, WEAPONS, WEAPON_ORDER } from '../src/player/weapons.ts';
import { ARCHETYPES } from '../src/ai/Enemy.ts';
import { DOCUMENTS, LEVEL01_BEATS, LEVEL01_OBJECTIVES, MEMORIES } from '../src/story/story.ts';

describe('weapon table', () => {
  it('lists every weapon in the cycle order exactly once', () => {
    const ids = Object.keys(WEAPONS).sort();
    expect([...WEAPON_ORDER].sort()).toEqual(ids);
    expect(new Set(WEAPON_ORDER).size).toBe(WEAPON_ORDER.length);
  });

  it('converts rate of fire to a sane shot interval', () => {
    expect(secondsPerShot(WEAPONS.colt)).toBeCloseTo(60 / 260, 6);
    // Nothing should be able to fire faster than 20 rounds a second.
    for (const def of Object.values(WEAPONS)) {
      expect(secondsPerShot(def)).toBeGreaterThan(0.05);
    }
  });

  it('keeps every firearm internally consistent', () => {
    for (const def of Object.values(WEAPONS)) {
      if (def.kind === 'melee' || def.kind === 'tool') continue;
      expect(def.magSize).toBeGreaterThan(0);
      expect(def.reserveMax).toBeGreaterThanOrEqual(def.magSize);
      expect(def.pellets).toBeGreaterThanOrEqual(1);
      expect(def.reloadSeconds).toBeGreaterThan(0);
      // Aiming must never be worse than hip fire.
      expect(def.aimSpread).toBeLessThanOrEqual(1);
      expect(def.onomatopoeia.length).toBeGreaterThan(0);
    }
  });

  it('makes the silenced pistol genuinely quiet', () => {
    expect(WEAPONS.silenced.noiseRadius).toBeLessThan(WEAPONS.colt.noiseRadius / 3);
  });
});

describe('enemy archetypes', () => {
  it('scales cleanly from ranger to sentinel', () => {
    expect(ARCHETYPES.ranger!.health).toBeLessThan(ARCHETYPES.trooper!.health);
    expect(ARCHETYPES.trooper!.health).toBeLessThan(ARCHETYPES.sentinel!.health);
    // Tougher guards react faster and shoot straighter.
    expect(ARCHETYPES.sentinel!.reactionTime).toBeLessThan(ARCHETYPES.ranger!.reactionTime);
    expect(ARCHETYPES.sentinel!.accuracy).toBeLessThan(ARCHETYPES.ranger!.accuracy);
  });

  it('gives every archetype a vision cone narrower than a full circle', () => {
    for (const a of Object.values(ARCHETYPES)) {
      expect(a.visionFov).toBeGreaterThan(0);
      expect(a.visionFov).toBeLessThan(Math.PI * 2);
      expect(a.hearingRange).toBeLessThan(a.visionRange);
    }
  });
});

describe('story data', () => {
  it('keys every memory and document by its own id', () => {
    for (const [key, memory] of Object.entries(MEMORIES)) expect(memory.id).toBe(key);
    for (const [key, doc] of Object.entries(DOCUMENTS)) expect(doc.id).toBe(key);
  });

  it('gives every objective some text and every beat some dialogue', () => {
    for (const [key, objective] of Object.entries(LEVEL01_OBJECTIVES)) {
      expect(objective.id).toBe(key);
      expect(objective.text.length).toBeGreaterThan(3);
    }
    for (const beats of Object.values(LEVEL01_BEATS)) {
      expect(beats.length).toBeGreaterThan(0);
      for (const beat of beats) expect(beat.text.length).toBeGreaterThan(3);
    }
  });
});
