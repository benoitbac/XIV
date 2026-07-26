import { mulberry32 } from '../core/mathx.ts';

/**
 * Tiling noise for material synthesis.
 *
 * Everything here wraps: a texture that does not tile seamlessly shows a hard
 * grid across any surface bigger than one tile, which on a 40-metre cliff is
 * the first thing the eye finds.
 */

/** Value noise on an integer lattice that wraps at `period`. */
export function makeValueNoise(period: number, seed: number): (x: number, y: number) => number {
  const rand = mulberry32(seed);
  const lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();

  const at = (ix: number, iy: number): number =>
    lattice[(((iy % period) + period) % period) * period + (((ix % period) + period) % period)]!;

  // Smootherstep interpolation: bilinear alone leaves visible diamond creases.
  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = fade(x - x0);
    const fy = fade(y - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
}

/** Fractal sum of tiling value noise. Returns roughly 0..1. */
export function fbm(
  size: number,
  seed: number,
  octaves: number,
  baseFrequency: number,
  gain = 0.5,
): Float32Array {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;

  for (let o = 0; o < octaves; o++) {
    const period = Math.max(2, Math.round(baseFrequency * 2 ** o));
    const noise = makeValueNoise(period, seed + o * 7919);
    const scale = period / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        out[y * size + x]! += noise(x * scale, y * scale) * amplitude;
      }
    }
    total += amplitude;
    amplitude *= gain;
  }

  for (let i = 0; i < out.length; i++) out[i]! /= total;
  return out;
}

/**
 * Tiling Worley (cellular) noise: distance to the nearest of a set of wrapped
 * feature points. This is what turns a grey rectangle into cracked stone.
 */
export function worley(size: number, seed: number, cells: number): Float32Array {
  const rand = mulberry32(seed);
  // One feature point per cell, stored on the grid so a pixel only ever has to
  // consider its own cell and the eight around it. Testing every point instead
  // is O(pixels × cells²) — at 512² with a 26×26 grid that is 177 million
  // distance tests, which is seconds of stall at start-up.
  const px = new Float32Array(cells * cells);
  const py = new Float32Array(cells * cells);
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const i = cy * cells + cx;
      px[i] = cx + rand();
      py[i] = cy + rand();
    }
  }

  const out = new Float32Array(size * size);
  const scale = cells / size;

  for (let y = 0; y < size; y++) {
    const fy = y * scale;
    const cy0 = Math.floor(fy);
    for (let x = 0; x < size; x++) {
      const fx = x * scale;
      const cx0 = Math.floor(fx);
      let nearest = Infinity;

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          // Wrap the cell index, and offset the point by a whole grid so the
          // field tiles seamlessly across the texture edge.
          const wx = (((cx0 + ox) % cells) + cells) % cells;
          const wy = (((cy0 + oy) % cells) + cells) % cells;
          const i = wy * cells + wx;
          const dx = px[i]! + (cx0 + ox - wx) - fx;
          const dy = py[i]! + (cy0 + oy - wy) - fy;
          const d = dx * dx + dy * dy;
          if (d < nearest) nearest = d;
        }
      }
      out[y * size + x] = Math.sqrt(nearest);
    }
  }
  return out;
}

/** In-place remap of a field to 0..1. */
export function normalise(field: Float32Array): Float32Array {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of field) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  for (let i = 0; i < field.length; i++) field[i] = (field[i]! - lo) / span;
  return field;
}

export const smoothstep01 = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
};
