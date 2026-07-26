import {
  BufferAttribute,
  DataTexture,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type BoxGeometry,
  type Texture,
} from 'three';
import { mulberry32 } from '../core/mathx.ts';
import { fbm, normalise, smoothstep01, worley } from './noise.ts';

/**
 * Material synthesis.
 *
 * Every surface is built from a **height field** first, then the albedo and the
 * normal map are derived from it. That ordering is the whole trick: painting
 * noise straight into a colour map gives dirt, but it gives no shape, so the
 * surface still reads as a flat card. A normal map derived from real height
 * makes plank seams, rivets and rock facets catch the key light — and because
 * the ink pass runs a Sobel over the *normal* buffer, that detail also puts
 * fine black lines into the frame, which is exactly what the look is made of.
 *
 * Nothing is loaded from disk. Every byte here is computed at start-up from a
 * fixed seed, so a build is reproducible and the download stays tiny.
 */

export type SurfaceTexture =
  'snow' | 'plank' | 'planed' | 'concrete' | 'metal' | 'rock' | 'shingle' | 'canvas';

export interface Material {
  map: DataTexture;
  normalMap: DataTexture;
}

const SIZE = 512;

interface Surface {
  /** 0..1 height field, SIZE×SIZE. */
  height: Float32Array;
  /** Per-texel albedo multiplier, 0..1 — dirt, stain, paint wear. */
  tint: Float32Array;
  /** How strongly the normal map should bite. */
  relief: number;
}

const cache = new Map<SurfaceTexture, Material>();
const idx = (x: number, y: number): number => (y & (SIZE - 1)) * SIZE + (x & (SIZE - 1));

// ---------------------------------------------------------------------------
// Surface recipes
// ---------------------------------------------------------------------------

function snowSurface(): Surface {
  // Two scales of drift plus fine sastrugi — wind-carved ripples.
  const coarse = fbm(SIZE, 11, 4, 3, 0.55);
  const fine = fbm(SIZE, 23, 5, 12, 0.5);
  const height = new Float32Array(SIZE * SIZE);
  const tint = new Float32Array(SIZE * SIZE);
  const rand = mulberry32(101);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      // Sastrugi, kept faint and strongly warped by the drift noise. A clean
      // sine here prints as corduroy stripes across the whole snowfield.
      const ripple = Math.sin((x / SIZE) * Math.PI * 22 + coarse[i]! * 26) * 0.5 + 0.5;
      height[i] = coarse[i]! * 0.74 + fine[i]! * 0.2 + ripple * 0.06;
      // Snow is near-white; the variation belongs almost entirely in the relief.
      tint[i] = 0.93 + fine[i]! * 0.07;
    }
  }
  // Sparkle: isolated bright grains, the one thing snow reads by up close.
  for (let n = 0; n < 2200; n++) {
    const i = Math.floor(rand() * height.length);
    tint[i] = 1;
    height[i]! += 0.08;
  }
  return { height: normalise(height), tint, relief: 0.45 };
}

function plankSurface(planed: boolean): Surface {
  const boards = planed ? 5 : 7;
  const boardHeight = SIZE / boards;
  const grain = fbm(SIZE, planed ? 41 : 37, 5, planed ? 5 : 3, 0.55);
  const fine = fbm(SIZE, 53, 4, 26, 0.5);
  const height = new Float32Array(SIZE * SIZE);
  const tint = new Float32Array(SIZE * SIZE);
  const rand = mulberry32(planed ? 202 : 203);

  // Each board gets its own shade and a slight cup across its width.
  const shades = Array.from({ length: boards }, () => 0.78 + rand() * 0.28);
  const cups = Array.from({ length: boards }, () => 0.45 + rand() * 0.55);

  for (let y = 0; y < SIZE; y++) {
    const board = Math.floor(y / boardHeight);
    const within = (y % boardHeight) / boardHeight;
    // Distance to the nearest seam, 0 at the seam and 1 mid-board.
    const seam = Math.min(within, 1 - within) * 2;
    const seamDepth = smoothstep01(0, 0.14, seam);
    const cup = Math.sin(within * Math.PI) * cups[board]!;

    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      // Grain runs along the board, so the noise is stretched in x.
      const g = grain[idx(x, (board * 137 + Math.floor(within * boardHeight)) | 0)]!;
      height[i] = seamDepth * (0.55 + cup * 0.3) + g * 0.16 + fine[i]! * 0.06;
      tint[i] = shades[board]! * (0.86 + g * 0.2) * (0.7 + seamDepth * 0.3);
    }
  }

  if (!planed) {
    // Nail heads: a dimple and a dark ring, two per board end.
    for (let board = 0; board < boards; board++) {
      for (const nx of [18, SIZE - 22, (SIZE / 2) | 0]) {
        const ny = Math.round(board * boardHeight + boardHeight * 0.5);
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const d = Math.hypot(dx, dy);
            if (d > 4) continue;
            const i = idx(nx + dx, ny + dy);
            height[i] = height[i]! - smoothstep01(4, 1, d) * 0.35;
            tint[i] = tint[i]! * (1 - smoothstep01(4, 0, d) * 0.45);
          }
        }
      }
    }
  }
  return { height: normalise(height), tint, relief: planed ? 0.7 : 1.0 };
}

function concreteSurface(): Surface {
  const base = fbm(SIZE, 61, 5, 4, 0.55);
  const aggregate = worley(SIZE, 67, 26);
  const fine = fbm(SIZE, 71, 4, 30, 0.5);
  const height = new Float32Array(SIZE * SIZE);
  const tint = new Float32Array(SIZE * SIZE);
  const rand = mulberry32(303);

  for (let i = 0; i < height.length; i++) {
    // Aggregate pebbles sit proud; the paste between them is lower.
    const pebble = smoothstep01(0.55, 0.2, aggregate[i]!);
    height[i] = base[i]! * 0.35 + pebble * 0.45 + fine[i]! * 0.2;
    tint[i] = 0.82 + base[i]! * 0.24 - pebble * 0.1;
  }

  // Hairline cracks: random walks gouged into the height.
  for (let c = 0; c < 7; c++) {
    let x = rand() * SIZE;
    let y = rand() * SIZE;
    let angle = rand() * Math.PI * 2;
    const length = 120 + rand() * 260;
    for (let s = 0; s < length; s++) {
      angle += (rand() - 0.5) * 0.4;
      x += Math.cos(angle);
      y += Math.sin(angle);
      const i = idx(Math.round(x), Math.round(y));
      height[i] = height[i]! - 0.5;
      tint[i] = tint[i]! * 0.55;
    }
  }
  return { height: normalise(height), tint, relief: 0.8 };
}

function metalSurface(): Surface {
  const streak = fbm(SIZE, 83, 4, 40, 0.5);
  const dents = fbm(SIZE, 89, 3, 6, 0.6);
  const height = new Float32Array(SIZE * SIZE);
  const tint = new Float32Array(SIZE * SIZE);
  const rand = mulberry32(404);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      // Brushed finish: noise stretched hard along y.
      const brushed = streak[idx(x, (y * 0.06) | 0)]!;
      height[i] = dents[i]! * 0.35 + brushed * 0.07;
      tint[i] = 0.86 + brushed * 0.2 + dents[i]! * 0.1;
    }
  }

  // Panel seam across the middle, with a row of rivets above it.
  for (let x = 0; x < SIZE; x++) {
    for (let dy = -2; dy <= 2; dy++) {
      const i = idx(x, SIZE / 2 + dy);
      height[i] = height[i]! - smoothstep01(2, 0, Math.abs(dy)) * 0.55;
      tint[i] = tint[i]! * 0.62;
    }
  }
  for (let rx = 16; rx < SIZE; rx += 46) {
    const ry = SIZE / 2 - 16;
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > 5) continue;
        const i = idx(rx + dx, ry + dy);
        height[i] = height[i]! + smoothstep01(5, 1, d) * 0.5;
        tint[i] = tint[i]! * (1 + smoothstep01(5, 2, d) * 0.12);
      }
    }
  }

  // Corrosion blooms: darker, rougher patches.
  for (let n = 0; n < 22; n++) {
    const cx = rand() * SIZE;
    const cy = rand() * SIZE;
    const r = 8 + rand() * 34;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const i = idx(Math.round(cx + dx), Math.round(cy + dy));
        const k = smoothstep01(r, r * 0.3, d);
        tint[i] = tint[i]! * (1 - k * 0.4);
        height[i] = height[i]! + k * 0.12 * streak[i]!;
      }
    }
  }
  return { height: normalise(height), tint, relief: 0.9 };
}

function rockSurface(): Surface {
  const facets = worley(SIZE, 97, 7);
  const detail = worley(SIZE, 101, 19);
  const rough = fbm(SIZE, 103, 5, 8, 0.55);
  const height = new Float32Array(SIZE * SIZE);
  const tint = new Float32Array(SIZE * SIZE);

  for (let i = 0; i < height.length; i++) {
    // Big facets with sharp valleys between them, then smaller ones on top.
    const major = 1 - smoothstep01(0, 0.55, facets[i]!);
    const minor = 1 - smoothstep01(0, 0.5, detail[i]!);
    height[i] = (1 - major) * 0.55 + (1 - minor) * 0.25 + rough[i]! * 0.3;
    tint[i] = 0.7 + (1 - major) * 0.3 + rough[i]! * 0.18;
  }
  return { height: normalise(height), tint, relief: 1.25 };
}

function shingleSurface(): Surface {
  const rows = 9;
  const perRow = 7;
  const rowHeight = SIZE / rows;
  const tileWidth = SIZE / perRow;
  const grain = fbm(SIZE, 109, 4, 14, 0.5);
  const height = new Float32Array(SIZE * SIZE);
  const tint = new Float32Array(SIZE * SIZE);
  const rand = mulberry32(505);
  const shades = Array.from({ length: rows * perRow }, () => 0.75 + rand() * 0.35);

  for (let y = 0; y < SIZE; y++) {
    const row = Math.floor(y / rowHeight);
    const withinRow = (y % rowHeight) / rowHeight;
    const offset = (row % 2) * (tileWidth / 2);

    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const col = Math.floor(((x + offset) % SIZE) / tileWidth);
      const withinCol = (((x + offset) % SIZE) % tileWidth) / tileWidth;
      const edge = Math.min(withinCol, 1 - withinCol) * 2;

      // Each course laps over the one below: height climbs down the row.
      const lap = 1 - withinRow;
      const gap = smoothstep01(0, 0.09, edge) * smoothstep01(0, 0.12, withinRow);
      height[i] = lap * 0.5 + gap * 0.4 + grain[i]! * 0.12;
      tint[i] = shades[(row * perRow + col) % shades.length]! * (0.72 + gap * 0.32);
    }
  }
  return { height: normalise(height), tint, relief: 1.0 };
}

function canvasSurface(): Surface {
  const slub = fbm(SIZE, 113, 4, 18, 0.5);
  const height = new Float32Array(SIZE * SIZE);
  const tint = new Float32Array(SIZE * SIZE);
  const threads = 90;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      // A plain weave: warp over weft, alternating each thread.
      const u = (x / SIZE) * threads;
      const v = (y / SIZE) * threads;
      const warp = Math.sin(u * Math.PI * 2) * 0.5 + 0.5;
      const weft = Math.sin(v * Math.PI * 2) * 0.5 + 0.5;
      const over = (Math.floor(u) + Math.floor(v)) % 2 === 0 ? warp : weft;
      height[i] = over * 0.7 + slub[i]! * 0.3;
      tint[i] = 0.8 + over * 0.16 + slub[i]! * 0.12;
    }
  }
  return { height: normalise(height), tint, relief: 0.55 };
}

const RECIPES: Record<SurfaceTexture, () => Surface> = {
  snow: snowSurface,
  plank: () => plankSurface(false),
  planed: () => plankSurface(true),
  concrete: concreteSurface,
  metal: metalSurface,
  rock: rockSurface,
  shingle: shingleSurface,
  canvas: canvasSurface,
};

// ---------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------

function bakeAlbedo(surface: Surface): DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    // Ambient occlusion baked from height: creases keep their shadow even when
    // the key light can't reach them.
    const ao = 0.7 + surface.height[i]! * 0.3;
    const v = Math.round(Math.min(1, surface.tint[i]! * ao) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Sobel over the height field, packed as a tangent-space normal map. */
function bakeNormal(surface: Surface): DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  const h = surface.height;
  const strength = surface.relief * 6;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const l = h[idx(x - 1, y)]!;
      const r = h[idx(x + 1, y)]!;
      const d = h[idx(x, y - 1)]!;
      const u = h[idx(x, y + 1)]!;

      const nx = (l - r) * strength;
      const ny = (d - u) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);

      const i = (y * SIZE + x) * 4;
      data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  return tex;
}

function configure(tex: Texture): void {
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 8;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
}

/** Albedo + normal map for a surface. Generated once, then shared. */
export function surfaceMaterial(name: SurfaceTexture): Material {
  let material = cache.get(name);
  if (material) return material;

  const surface = RECIPES[name]();
  const map = bakeAlbedo(surface);
  const normalMap = bakeNormal(surface);
  configure(map);
  configure(normalMap);

  material = { map, normalMap };
  cache.set(name, material);
  return material;
}

/** Convenience for callers that only want the colour map. */
export function surfaceTexture(name: SurfaceTexture): DataTexture {
  return surfaceMaterial(name).map;
}

/**
 * Generates every material ahead of time, one per animation frame.
 *
 * Baking all of them costs a couple of seconds. Doing that lazily on the first
 * level load freezes the game the instant the player presses Start; spreading
 * it across frames behind the title screen makes it invisible.
 */
export function warmMaterials(onDone?: () => void): void {
  const queue = Object.keys(RECIPES) as SurfaceTexture[];
  const next = (): void => {
    const name = queue.shift();
    if (!name) {
      onDone?.();
      return;
    }
    surfaceMaterial(name);
    requestAnimationFrame(next);
  };
  requestAnimationFrame(next);
}

/**
 * Rewrites a box's UVs so one texture tile covers a fixed number of world
 * metres on every face, regardless of the box's dimensions.
 *
 * Without this, a shared material stretches its texture across a 60-metre
 * ground slab and squashes it on a door frame — which is exactly what makes
 * untextured-looking programmer geometry.
 */
export function scaleBoxUVs(
  geometry: BoxGeometry,
  width: number,
  height: number,
  depth: number,
  metresPerTile: number,
): void {
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  // BoxGeometry emits faces in the order +X, -X, +Y, -Y, +Z, -Z, four vertices
  // each; on every face u runs along the first listed axis and v along the second.
  const spans: Array<[number, number]> = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];

  for (let face = 0; face < 6; face++) {
    const [su, sv] = spans[face]!;
    const ru = Math.max(su / metresPerTile, 0.06);
    const rv = Math.max(sv / metresPerTile, 0.06);
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
    }
  }
  uv.needsUpdate = true;
}
