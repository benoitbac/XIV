import {
  DataTexture,
  LinearFilter,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  RepeatWrapping,
  Texture,
  UnsignedByteType,
} from 'three';
import { color } from './palette.ts';

/**
 * A gradient map turns Lambert lighting into hard steps — the single most
 * important ingredient of the look. Two steps reads as a printed album,
 * three keeps enough form on characters to stay legible in motion.
 */
function gradientMap(steps: readonly number[]): DataTexture {
  const data = new Uint8Array(steps.length);
  for (let i = 0; i < steps.length; i++) data[i] = Math.round(steps[i]! * 255);
  const tex = new DataTexture(data, steps.length, 1, RedFormat, UnsignedByteType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Flat: one tone, for props that should sit back in the plate. */
export const RAMP_FLAT = /* @__PURE__ */ gradientMap([0.72]);
/** Two-tone: the default for architecture and terrain. */
export const RAMP_DUO = /* @__PURE__ */ gradientMap([0.42, 1.0]);
/** Three-tone: characters, so silhouettes keep their volume. */
export const RAMP_TRIO = /* @__PURE__ */ gradientMap([0.34, 0.68, 1.0]);

export type RampName = 'flat' | 'duo' | 'trio';

const RAMPS: Record<RampName, DataTexture> = {
  flat: RAMP_FLAT,
  duo: RAMP_DUO,
  trio: RAMP_TRIO,
};

export interface ToonOptions {
  ramp?: RampName;
  map?: Texture;
  transparent?: boolean;
  opacity?: number;
  emissive?: number;
}

const materialCache = new Map<string, MeshToonMaterial>();

/**
 * Shared toon materials, keyed by their visual parameters. Levels build a lot
 * of boxes out of a handful of surfaces; sharing keeps draw calls batchable.
 */
export function toon(hex: number, options: ToonOptions = {}): MeshToonMaterial {
  const ramp = options.ramp ?? 'duo';
  const key = `${hex}|${ramp}|${options.map?.uuid ?? ''}|${options.transparent ?? false}|${
    options.opacity ?? 1
  }|${options.emissive ?? 0}`;

  let mat = materialCache.get(key);
  if (mat) return mat;

  mat = new MeshToonMaterial({
    color: color(hex),
    gradientMap: RAMPS[ramp],
  });
  if (options.map) mat.map = options.map;
  if (options.transparent) {
    mat.transparent = true;
    mat.opacity = options.opacity ?? 1;
  }
  if (options.emissive !== undefined) mat.emissive = color(options.emissive);

  materialCache.set(key, mat);
  return mat;
}

/**
 * Hand-drawn hatching, generated rather than authored: used on large flat
 * surfaces so they don't read as dead polygons under the ink pass.
 */
export function hatchTexture(size = 128, density = 0.14): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const onLine = (x + y) % 9 === 0 && Math.random() < density * 6;
      const v = onLine ? 190 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
