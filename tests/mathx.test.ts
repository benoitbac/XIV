import { describe, expect, it } from 'vitest';
import { angleDelta, clamp, damp, lerp, mulberry32, smoothstep, TAU } from '../src/core/mathx.ts';

describe('clamp / lerp / smoothstep', () => {
  it('clamps to the bounds', () => {
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(9, 0, 1)).toBe(1);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it('interpolates and extrapolates linearly', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(lerp(4, 4, 0.9)).toBe(4);
  });

  it('eases with zero slope at both ends', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 6);
    expect(smoothstep(-2)).toBe(0);
  });
});

describe('damp', () => {
  it('converges toward the target', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = damp(v, 10, 8, 1 / 60);
    expect(v).toBeCloseTo(10, 3);
  });

  it('is frame-rate independent: one big step matches many small ones', () => {
    let fine = 0;
    for (let i = 0; i < 60; i++) fine = damp(fine, 1, 5, 1 / 60);
    const coarse = damp(0, 1, 5, 1);
    expect(fine).toBeCloseTo(coarse, 6);
  });
});

describe('angleDelta', () => {
  it('takes the short way round the circle', () => {
    expect(angleDelta(0, 0.5)).toBeCloseTo(0.5, 6);
    // Turning from just under a full turn to just over zero is a small step.
    expect(angleDelta(TAU - 0.1, 0.1)).toBeCloseTo(0.2, 6);
    expect(angleDelta(0.1, TAU - 0.1)).toBeCloseTo(-0.2, 6);
  });

  it('never returns more than half a turn', () => {
    for (let i = 0; i < 100; i++) {
      const a = (i / 100) * TAU * 3 - TAU;
      const b = ((i * 7) / 100) * TAU * 2 - TAU;
      expect(Math.abs(angleDelta(a, b))).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});

describe('mulberry32', () => {
  it('is deterministic for a given seed, so a level rebuilds identically', () => {
    const a = mulberry32(1414);
    const b = mulberry32(1414);
    const first = Array.from({ length: 16 }, () => a());
    const second = Array.from({ length: 16 }, () => b());
    expect(first).toEqual(second);
  });

  it('produces different streams for different seeds, inside [0, 1)', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let differences = 0;
    for (let i = 0; i < 64; i++) {
      const x = a();
      const y = b();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x !== y) differences++;
    }
    expect(differences).toBeGreaterThan(60);
  });
});
