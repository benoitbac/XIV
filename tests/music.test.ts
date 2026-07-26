import { describe, expect, it } from 'vitest';
import {
  MIXES,
  PROGRESSION,
  SCALE_MINOR,
  SCALE_PHRYGIAN,
  type MusicState,
} from '../src/core/Music.ts';

/**
 * The synth itself needs WebAudio, which does not exist under the test runner.
 * What *can* be checked here is the part that would fail silently: the mix
 * table and the note tables. A wrong scale degree or an inverted mix produces
 * music that plays perfectly and is simply wrong.
 */
describe('music mixes', () => {
  const states = Object.keys(MIXES) as MusicState[];

  it('keeps every layer gain and tempo in a sane range', () => {
    for (const state of states) {
      const mix = MIXES[state];
      for (const layer of [mix.pad, mix.bass, mix.pulse, mix.drums, mix.motif]) {
        expect(layer).toBeGreaterThanOrEqual(0);
        expect(layer).toBeLessThanOrEqual(1);
      }
      expect(mix.bpm).toBeGreaterThan(40);
      expect(mix.bpm).toBeLessThan(200);
    }
  });

  it('is actually silent when silent', () => {
    const mix = MIXES.silent;
    expect(mix.pad + mix.bass + mix.pulse + mix.drums + mix.motif).toBe(0);
  });

  it('escalates from calm to combat', () => {
    expect(MIXES.combat.bpm).toBeGreaterThan(MIXES.suspicious.bpm);
    expect(MIXES.suspicious.bpm).toBeGreaterThan(MIXES.calm.bpm);
    expect(MIXES.combat.drums).toBeGreaterThan(MIXES.suspicious.drums);
    expect(MIXES.suspicious.pulse).toBeGreaterThan(MIXES.calm.pulse);
    expect(MIXES.combat.bass).toBeGreaterThan(MIXES.calm.bass);
  });

  it('keeps drums out of everything except combat', () => {
    for (const state of states) {
      if (state === 'combat') continue;
      expect(MIXES[state].drums).toBe(0);
    }
  });

  it('makes the flashback bed the slowest and most sparse', () => {
    expect(MIXES.memory.bpm).toBeLessThanOrEqual(MIXES.calm.bpm);
    expect(MIXES.memory.drums).toBe(0);
    expect(MIXES.memory.pulse).toBe(0);
  });

  it('uses the tense mode only where tension belongs', () => {
    expect(MIXES.suspicious.phrygian).toBe(true);
    expect(MIXES.combat.phrygian).toBe(true);
    expect(MIXES.calm.phrygian).toBe(false);
    expect(MIXES.memory.phrygian).toBe(false);
  });
});

describe('note tables', () => {
  it('defines seven ascending degrees inside one octave', () => {
    for (const scale of [SCALE_MINOR, SCALE_PHRYGIAN]) {
      expect(scale).toHaveLength(7);
      expect(scale[0]).toBe(0);
      for (let i = 1; i < scale.length; i++) {
        expect(scale[i]!).toBeGreaterThan(scale[i - 1]!);
      }
      expect(scale.at(-1)!).toBeLessThan(12);
    }
  });

  it('differs from natural minor only in the flattened second', () => {
    expect(SCALE_PHRYGIAN[1]).toBe(1);
    expect(SCALE_MINOR[1]).toBe(2);
    for (let i = 2; i < SCALE_MINOR.length; i++) {
      expect(SCALE_PHRYGIAN[i]).toBe(SCALE_MINOR[i]);
    }
  });

  it('keeps every progression degree inside the scale', () => {
    for (const degree of PROGRESSION) {
      expect(degree).toBeGreaterThanOrEqual(0);
      expect(degree).toBeLessThan(SCALE_MINOR.length);
    }
    // An eight-bar loop keeps the phrase length a power of two, so it lines up
    // with the sixteen-step bar the sequencer counts in.
    expect(PROGRESSION.length % 4).toBe(0);
  });
});
