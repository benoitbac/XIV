import {
  DataTexture,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  Texture,
  UnsignedByteType,
  Vector2,
} from 'three';
import { color } from './palette.ts';
import { surfaceMaterial, type SurfaceTexture } from './textures.ts';

/**
 * How hard each surface's normal map bites. Snow wants a whisper; rock and
 * cladding want to be felt. Too much and the toon ramp breaks into noise.
 */
const NORMAL_STRENGTH: Record<SurfaceTexture, number> = {
  snow: 0.35,
  plank: 0.85,
  planed: 0.6,
  concrete: 0.7,
  metal: 0.8,
  rock: 1.1,
  shingle: 0.9,
  canvas: 0.5,
};

/**
 * A gradient map turns Lambert lighting into hard steps — the single most
 * important ingredient of the look. It only works if the scene is lit like a
 * stage: one strong key, almost no ambient. Flood the scene with fill light and
 * every surface saturates into the top band, which reads as flat unlit colour.
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

/** Flat: one tone, for small props that should sit back in the plate. */
export const RAMP_FLAT = /* @__PURE__ */ gradientMap([0.86]);
/** Two-tone: hard light/shade break. Architecture, crates, metalwork. */
export const RAMP_DUO = /* @__PURE__ */ gradientMap([0.36, 1.0]);
/** Three-tone: characters and anything curved, so volume survives motion. */
export const RAMP_TRIO = /* @__PURE__ */ gradientMap([0.26, 0.58, 1.0]);
/**
 * Snow: bright everywhere, but with two cool steps so drifts still show form.
 * A duo ramp on snow makes the shaded side read as grey mud.
 */
export const RAMP_SNOW = /* @__PURE__ */ gradientMap([0.6, 0.8, 1.0]);
/** Sky-facing foliage: dark base so pines read as silhouettes against snow. */
export const RAMP_FOLIAGE = /* @__PURE__ */ gradientMap([0.2, 0.52, 0.9]);

export type RampName = 'flat' | 'duo' | 'trio' | 'snow' | 'foliage';

const RAMPS: Record<RampName, DataTexture> = {
  flat: RAMP_FLAT,
  duo: RAMP_DUO,
  trio: RAMP_TRIO,
  snow: RAMP_SNOW,
  foliage: RAMP_FOLIAGE,
};

export interface ToonOptions {
  ramp?: RampName;
  /** Procedural surface detail; the mesh must have world-scaled UVs. */
  texture?: SurfaceTexture;
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
  const key = `${hex}|${ramp}|${options.texture ?? ''}|${options.map?.uuid ?? ''}|${
    options.transparent ?? false
  }|${options.opacity ?? 1}|${options.emissive ?? 0}`;

  let mat = materialCache.get(key);
  if (mat) return mat;

  mat = new MeshToonMaterial({
    color: color(hex),
    gradientMap: RAMPS[ramp],
  });

  if (options.texture) {
    const material = surfaceMaterial(options.texture);
    mat.map = material.map;
    // The normal map is doing two jobs: it breaks the flat toon step across a
    // surface, and — because the ink pass runs its Sobel over the normal
    // buffer — it also puts fine drawn lines into seams, rivets and rock
    // facets. Turn it off and the surfaces go back to reading as cards.
    mat.normalMap = material.normalMap;
    mat.normalScale = new Vector2(
      NORMAL_STRENGTH[options.texture],
      NORMAL_STRENGTH[options.texture],
    );
  } else if (options.map) {
    mat.map = options.map;
  }

  if (options.transparent) {
    mat.transparent = true;
    mat.opacity = options.opacity ?? 1;
  }
  if (options.emissive !== undefined) mat.emissive = color(options.emissive);

  materialCache.set(key, mat);
  return mat;
}

/** Unlit flat colour — used for very distant silhouettes and sky elements. */
export function flat(hex: number): MeshToonMaterial {
  return toon(hex, { ramp: 'flat' });
}
