import {
  BufferAttribute,
  CanvasTexture,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type BoxGeometry,
} from 'three';
import { mulberry32 } from '../core/mathx.ts';

/**
 * Surfaces are drawn into a canvas at load time rather than shipped as image
 * files. They are deliberately low-contrast: the toon ramp and the ink pass do
 * the heavy lifting, and a texture that fights them turns the frame to mud.
 * Their job is only to stop a 20-metre wall from reading as one dead rectangle.
 */

export type SurfaceTexture =
  'snow' | 'plank' | 'planed' | 'concrete' | 'metal' | 'rock' | 'shingle';

const SIZE = 256;
const cache = new Map<SurfaceTexture, CanvasTexture>();

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('XIV: 2D canvas unavailable for texture generation.');
  return [c, ctx];
}

function finish(element: HTMLCanvasElement): CanvasTexture {
  const tex = new CanvasTexture(element);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Speckle + drift lines: reads as wind-packed snow rather than white paint. */
function drawSnow(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 140; i++) {
    const y = rand() * SIZE;
    ctx.strokeStyle = rand() < 0.5 ? '#7f8c9c' : '#ffffff';
    ctx.lineWidth = 0.6 + rand() * 2.2;
    ctx.beginPath();
    ctx.moveTo(-10, y);
    ctx.bezierCurveTo(
      SIZE * 0.3,
      y + (rand() - 0.5) * 22,
      SIZE * 0.7,
      y + (rand() - 0.5) * 22,
      SIZE + 10,
      y,
    );
    ctx.stroke();
  }

  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() < 0.4 ? '#6d7a8a' : '#ffffff';
    ctx.fillRect(rand() * SIZE, rand() * SIZE, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;
}

/** Horizontal boards with a seam every eighth of the tile, plus grain. */
function drawPlank(ctx: CanvasRenderingContext2D, rand: () => number, planed: boolean): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const boards = planed ? 6 : 8;
  const boardHeight = SIZE / boards;

  for (let b = 0; b < boards; b++) {
    const y = b * boardHeight;
    // Each board is a slightly different shade — the single cheapest way to
    // stop cladding from looking like one printed sheet.
    ctx.globalAlpha = 0.09 + rand() * 0.1;
    ctx.fillStyle = rand() < 0.5 ? '#000000' : '#ffffff';
    ctx.fillRect(0, y, SIZE, boardHeight);

    // Seam.
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, y, SIZE, 1.6);

    // Grain.
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#000000';
    for (let g = 0; g < (planed ? 3 : 6); g++) {
      const gy = y + 3 + rand() * (boardHeight - 6);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(
        SIZE * 0.35,
        gy + (rand() - 0.5) * 4,
        SIZE * 0.7,
        gy + (rand() - 0.5) * 4,
        SIZE,
        gy,
      );
      ctx.stroke();
    }

    if (!planed) {
      // Nail heads at the ends, like real cladding.
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000000';
      for (const nx of [6, SIZE - 8]) ctx.fillRect(nx, y + boardHeight / 2 - 1, 2.4, 2.4);
    }
  }
  ctx.globalAlpha = 1;
}

/** Aggregate speckle plus a few hairline cracks. */
function drawConcrete(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rand() < 0.5 ? '#000000' : '#ffffff';
    const s = 1 + rand() * 2.4;
    ctx.fillRect(rand() * SIZE, rand() * SIZE, s, s);
  }

  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = '#000000';
  for (let i = 0; i < 5; i++) {
    let x = rand() * SIZE;
    let y = rand() * SIZE;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 9; s++) {
      x += (rand() - 0.5) * 34;
      y += (rand() - 0.5) * 34;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Vertical brush streaks, rivet rows and a little corrosion. */
function drawMetal(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = rand() < 0.5 ? '#000000' : '#ffffff';
    ctx.fillRect(rand() * SIZE, 0, 0.8 + rand() * 2, SIZE);
  }

  // Panel seam + rivets across the middle.
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, SIZE / 2, SIZE, 1.4);
  ctx.globalAlpha = 0.42;
  for (let x = 8; x < SIZE; x += 22) {
    ctx.beginPath();
    ctx.arc(x, SIZE / 2 - 6, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(
      rand() * SIZE,
      rand() * SIZE,
      3 + rand() * 9,
      2 + rand() * 5,
      rand() * 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Blocky facets, so a cliff reads as broken stone rather than a grey slab. */
function drawRock(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  for (let i = 0; i < 44; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const w = 18 + rand() * 62;
    const h = 14 + rand() * 48;
    ctx.globalAlpha = 0.06 + rand() * 0.09;
    ctx.fillStyle = rand() < 0.5 ? '#000000' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + (rand() - 0.5) * 12);
    ctx.lineTo(x + w * 0.8, y + h);
    ctx.lineTo(x - w * 0.1, y + h * 0.85);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Overlapping courses, for roofs. */
function drawShingle(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const rows = 8;
  const rowHeight = SIZE / rows;
  const perRow = 6;
  for (let r = 0; r < rows; r++) {
    const y = r * rowHeight;
    const offset = (r % 2) * (SIZE / perRow / 2);
    for (let c = -1; c < perRow; c++) {
      const x = c * (SIZE / perRow) + offset;
      ctx.globalAlpha = 0.07 + rand() * 0.1;
      ctx.fillStyle = rand() < 0.5 ? '#000000' : '#ffffff';
      ctx.fillRect(x, y, SIZE / perRow - 1.5, rowHeight - 1.5);
    }
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, y, SIZE, 1.5);
  }
  ctx.globalAlpha = 1;
}

const DRAW: Record<SurfaceTexture, (ctx: CanvasRenderingContext2D, rand: () => number) => void> = {
  snow: (ctx, rand) => drawSnow(ctx, rand),
  plank: (ctx, rand) => drawPlank(ctx, rand, false),
  planed: (ctx, rand) => drawPlank(ctx, rand, true),
  concrete: (ctx, rand) => drawConcrete(ctx, rand),
  metal: (ctx, rand) => drawMetal(ctx, rand),
  rock: (ctx, rand) => drawRock(ctx, rand),
  shingle: (ctx, rand) => drawShingle(ctx, rand),
};

/** Textures are seeded, so a rebuild is byte-identical run to run. */
export function surfaceTexture(name: SurfaceTexture): CanvasTexture {
  let tex = cache.get(name);
  if (tex) return tex;
  const [element, ctx] = canvas();
  DRAW[name](ctx, mulberry32(name.length * 7919 + 1414));
  tex = finish(element);
  cache.set(name, tex);
  return tex;
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
