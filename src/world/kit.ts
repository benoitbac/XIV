import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshToonMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three';
import { PALETTE } from '../render/palette.ts';
import { toon } from '../render/toon.ts';
import { scaleBoxUVs } from '../render/textures.ts';
import { mulberry32 } from '../core/mathx.ts';

/**
 * The prop kit.
 *
 * The single biggest reason a cel-shaded scene reads as "programmer art" is
 * that the ink pass has nothing to draw: a bare wall has one silhouette and no
 * interior edges. Every object here exists to put believable black lines into
 * the frame — battens on a crate, a chimney against a roofline, the rungs of a
 * ladder. Detail is authored, never subdivided.
 *
 * Everything is built from boxes and short cylinders, and every group returned
 * here is positioned with its origin at floor level.
 */

const M = {
  planks: () => toon(PALETTE.wood, { ramp: 'duo', texture: 'plank' }),
  planksDark: () => toon(PALETTE.woodDark, { ramp: 'duo', texture: 'plank' }),
  planed: () => toon(0x6b4c31, { ramp: 'duo', texture: 'planed' }),
  steel: () => toon(PALETTE.steel, { ramp: 'duo', texture: 'metal' }),
  steelDark: () => toon(PALETTE.steelDark, { ramp: 'duo', texture: 'metal' }),
  iron: () => toon(0x24282e, { ramp: 'trio' }),
  rust: () => toon(PALETTE.rust, { ramp: 'duo', texture: 'metal' }),
  snow: () => toon(PALETTE.snow, { ramp: 'snow', texture: 'snow' }),
  concrete: () => toon(PALETTE.concrete, { ramp: 'duo', texture: 'concrete' }),
  rock: () => toon(0x5d6570, { ramp: 'trio', texture: 'rock' }),
  glass: () => toon(0x9fc4d6, { ramp: 'flat', transparent: true, opacity: 0.34 }),
  canvasCloth: () => toon(0x6b6a52, { ramp: 'duo' }),
  redPaint: () => toon(0x9d3a2f, { ramp: 'duo', texture: 'metal' }),
  brass: () => toon(0xa8873f, { ramp: 'trio' }),
  paper: () => toon(0xd8cdb4, { ramp: 'flat' }),
  foliage: () => toon(0x2c4436, { ramp: 'foliage' }),
  foliageLight: () => toon(0x37533f, { ramp: 'foliage' }),
  bark: () => toon(0x3b2b1d, { ramp: 'duo', texture: 'plank' }),
  lampGlow: () => toon(0xe9bb3c, { ramp: 'flat', emissive: 0xe9bb3c }),
};

/** Textured box helper: world-scaled UVs so nothing stretches. */
function tbox(w: number, h: number, d: number, material: MeshToonMaterial, tile = 1.2): Mesh {
  const geometry = new BoxGeometry(w, h, d);
  if (material.map) scaleBoxUVs(geometry, w, h, d, tile);
  return new Mesh(geometry, material);
}

function put(mesh: Mesh, x: number, y: number, z: number, ry = 0): Mesh {
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  return mesh;
}

function cyl(
  rTop: number,
  rBottom: number,
  height: number,
  material: MeshToonMaterial,
  segments = 10,
): Mesh {
  return new Mesh(new CylinderGeometry(rTop, rBottom, height, segments), material);
}

// ---------------------------------------------------------------------------
// Signage — painted lettering, generated so levels can say things
// ---------------------------------------------------------------------------

const signCache = new Map<string, CanvasTexture>();

function signTexture(text: string, background: string, ink: string): CanvasTexture {
  const key = `${text}|${background}|${ink}`;
  const cached = signCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 128);

  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 108);

  ctx.fillStyle = ink;
  ctx.font = 'bold 62px "Oswald", "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68, 452);

  // Weathering, so the paint isn't showroom-fresh.
  const rand = mulberry32(text.length * 977 + 13);
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = rand() < 0.5 ? '#000000' : '#ffffff';
    ctx.fillRect(rand() * 512, rand() * 128, 2 + rand() * 12, 1 + rand() * 5);
  }
  ctx.globalAlpha = 1;

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  signCache.set(key, tex);
  return tex;
}

/** A painted board on two posts. `height` is to the top of the board. */
export function sign(text: string, width = 2.2, height = 2.4): Group {
  const g = new Group();
  const post = M.planksDark();
  const boardHeight = width * 0.25;

  for (const side of [-1, 1]) {
    g.add(put(tbox(0.1, height, 0.1, post), (side * width) / 2 - side * 0.16, height / 2, 0));
  }

  const board = new Mesh(
    new BoxGeometry(width, boardHeight, 0.07),
    toon(0xffffff, { ramp: 'duo', map: signTexture(text, '#f0e7d4', '#1b1815') }),
  );
  board.position.set(0, height - boardHeight / 2 - 0.15, 0.02);
  g.add(board);
  return g;
}

// ---------------------------------------------------------------------------
// Containers and clutter
// ---------------------------------------------------------------------------

/** Wooden crate with corner battens and a diagonal brace on each face. */
export function crate(size = 0.9): Group {
  const g = new Group();
  const body = M.planks();
  const batten = M.planksDark();

  g.add(put(tbox(size, size, size, body, 0.55), 0, size / 2, 0));

  const t = size * 0.09;
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    g.add(put(tbox(t, size, t, batten, 0.4), (x * size) / 2, size / 2, (z * size) / 2));
  }
  for (const y of [t / 2, size - t / 2]) {
    g.add(put(tbox(size + 0.01, t, t, batten, 0.4), 0, y, size / 2));
    g.add(put(tbox(size + 0.01, t, t, batten, 0.4), 0, y, -size / 2));
    g.add(put(tbox(t, t, size + 0.01, batten, 0.4), size / 2, y, 0));
    g.add(put(tbox(t, t, size + 0.01, batten, 0.4), -size / 2, y, 0));
  }
  // The diagonal is what makes it read as a crate rather than a cube.
  const brace = put(tbox(size * 1.32, t, t * 0.8, batten, 0.4), 0, size / 2, size / 2 + 0.005);
  brace.rotation.z = Math.PI / 4;
  g.add(brace);
  return g;
}

/** Steel drum with rolling hoops. */
export function drum(painted = false): Group {
  const g = new Group();
  const body = painted ? M.redPaint() : M.rust();
  g.add(put(cyl(0.29, 0.29, 0.88, body, 12), 0, 0.44, 0));
  for (const y of [0.26, 0.62]) {
    const hoop = new Mesh(new TorusGeometry(0.3, 0.026, 6, 14), M.steelDark());
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    g.add(hoop);
  }
  g.add(put(cyl(0.3, 0.3, 0.04, M.steelDark(), 12), 0, 0.88, 0));
  g.add(put(cyl(0.05, 0.05, 0.04, M.brass(), 8), 0.16, 0.91, 0));
  return g;
}

/** Stack of sawn logs behind a pair of retaining stakes. */
export function logPile(width = 2.2, rows = 3): Group {
  const g = new Group();
  const bark = M.bark();
  const rand = mulberry32(31);
  const r = 0.13;
  for (let row = 0; row < rows; row++) {
    const count = Math.floor(width / (r * 2)) - (row % 2);
    for (let i = 0; i < count; i++) {
      const log = cyl(r, r, width * 0.42 + rand() * 0.1, bark, 8);
      log.rotation.z = Math.PI / 2;
      log.position.set(
        -width / 2 + r + i * r * 2 + (row % 2) * r,
        r + row * r * 1.78,
        (rand() - 0.5) * 0.06,
      );
      g.add(log);
    }
  }
  for (const side of [-1, 1]) {
    g.add(
      put(
        tbox(0.08, rows * r * 2 + 0.3, 0.08, M.planksDark(), 0.4),
        (side * width) / 2,
        (rows * r * 2) / 2,
        0,
      ),
    );
  }
  return g;
}

/** A bank of dented metal lockers. */
export function lockers(count = 3): Group {
  const g = new Group();
  const w = 0.44;
  const h = 1.85;
  const shell = M.steel();
  const doorMat = M.steelDark();

  g.add(put(tbox(w * count, h, 0.42, shell, 0.9), (w * count) / 2 - w / 2, h / 2, 0));
  for (let i = 0; i < count; i++) {
    const x = i * w;
    g.add(put(tbox(w - 0.045, h - 0.12, 0.03, doorMat, 0.5), x, h / 2, 0.215));
    g.add(put(tbox(0.05, 0.16, 0.035, M.brass(), 0.2), x + w / 2 - 0.11, h * 0.52, 0.235));
    // Vent slots at the top of each door.
    for (let s = 0; s < 3; s++) {
      g.add(put(tbox(w * 0.5, 0.018, 0.02, M.iron()), x, h - 0.2 - s * 0.06, 0.235));
    }
  }
  g.add(put(tbox(w * count + 0.06, 0.06, 0.46, doorMat, 0.5), (w * count) / 2 - w / 2, h, 0));
  return g;
}

/** Open shelving with assorted junk on it. */
export function shelfUnit(width = 1.6, shelves = 4): Group {
  const g = new Group();
  const wood = M.planed();
  const h = 1.9;
  for (const side of [-1, 1]) {
    g.add(put(tbox(0.07, h, 0.42, wood, 0.6), (side * width) / 2, h / 2, 0));
  }
  const rand = mulberry32(77);
  for (let i = 0; i < shelves; i++) {
    const y = 0.28 + (i * (h - 0.4)) / (shelves - 1);
    g.add(put(tbox(width, 0.05, 0.42, wood, 0.6), 0, y, 0));
    // Clutter: tins, boxes, a bottle. Cheap, and it fills the ink pass.
    const items = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < items; k++) {
      const x = -width / 2 + 0.16 + rand() * (width - 0.32);
      if (rand() < 0.45) {
        g.add(put(cyl(0.055, 0.055, 0.16, M.brass(), 8), x, y + 0.105, (rand() - 0.5) * 0.16));
      } else {
        const bw = 0.1 + rand() * 0.14;
        g.add(
          put(tbox(bw, 0.13, 0.16, M.paper(), 0.3), x, y + 0.09, (rand() - 0.5) * 0.14, rand()),
        );
      }
    }
  }
  return g;
}

/** Trestle desk with a drawer block and a chair pushed under it. */
export function desk(width = 1.5): Group {
  const g = new Group();
  const wood = M.planed();
  const h = 0.76;
  g.add(put(tbox(width, 0.055, 0.72, wood, 0.7), 0, h, 0));
  g.add(put(tbox(width + 0.06, 0.02, 0.76, M.planksDark(), 0.7), 0, h + 0.04, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(put(tbox(0.07, h, 0.07, wood, 0.4), (sx * (width - 0.14)) / 2, h / 2, sz * 0.3));
    }
  }
  // Drawer block with handles.
  g.add(put(tbox(0.44, 0.6, 0.62, wood, 0.5), width / 2 - 0.3, 0.3, 0));
  for (let i = 0; i < 3; i++) {
    g.add(put(tbox(0.4, 0.015, 0.02, M.planksDark()), width / 2 - 0.3, 0.14 + i * 0.18, 0.315));
    g.add(put(tbox(0.13, 0.03, 0.03, M.brass()), width / 2 - 0.3, 0.22 + i * 0.18, 0.325));
  }
  return g;
}

export function chair(): Group {
  const g = new Group();
  const wood = M.planed();
  const seat = 0.46;
  g.add(put(tbox(0.42, 0.05, 0.42, wood, 0.4), 0, seat, 0));
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    g.add(put(tbox(0.05, seat, 0.05, wood, 0.3), x * 0.17, seat / 2, z * 0.17));
  }
  g.add(put(tbox(0.42, 0.5, 0.05, wood, 0.4), 0, seat + 0.25, -0.19));
  g.add(put(tbox(0.36, 0.05, 0.03, M.planksDark()), 0, seat + 0.34, -0.16));
  return g;
}

/** Cast-iron stove with a flue that can run up through a roof. */
export function stove(flueHeight = 2.4): Group {
  const g = new Group();
  const iron = M.iron();
  g.add(put(tbox(0.66, 0.16, 0.56, iron), 0, 0.08, 0));
  g.add(put(tbox(0.6, 0.72, 0.5, iron), 0, 0.52, 0));
  g.add(put(tbox(0.68, 0.06, 0.58, iron), 0, 0.91, 0));
  // Firebox door with a glowing slot — the only warm light in the level.
  g.add(put(tbox(0.3, 0.3, 0.03, M.steelDark()), 0, 0.5, 0.26));
  g.add(put(tbox(0.2, 0.05, 0.02, M.lampGlow()), 0, 0.5, 0.275));
  g.add(put(cyl(0.05, 0.05, 0.1, M.brass(), 8), 0.18, 0.5, 0.27));
  g.add(put(cyl(0.09, 0.09, flueHeight, iron, 10), 0, 0.94 + flueHeight / 2, -0.14));
  g.add(put(cyl(0.11, 0.11, 0.06, iron, 10), 0, 1.1, -0.14));
  return g;
}

/** Field radio set on a stand: dials, a handset, a whip aerial. */
export function radioSet(): Group {
  const g = new Group();
  g.add(put(tbox(0.58, 0.38, 0.34, M.canvasCloth(), 0.4), 0, 0.19, 0));
  g.add(put(tbox(0.5, 0.26, 0.02, M.steelDark()), 0, 0.22, 0.18));
  for (let i = 0; i < 3; i++) {
    g.add(put(cyl(0.045, 0.045, 0.04, M.brass(), 8), -0.15 + i * 0.15, 0.24, 0.2));
  }
  g.add(put(tbox(0.16, 0.09, 0.015, M.lampGlow()), 0.14, 0.1, 0.19));
  const aerial = cyl(0.008, 0.014, 1.1, M.steelDark(), 6);
  aerial.position.set(0.24, 0.93, -0.1);
  aerial.rotation.z = -0.12;
  g.add(aerial);
  g.add(put(tbox(0.09, 0.16, 0.07, M.iron()), -0.34, 0.08, 0.05, 0.4));
  return g;
}

/** Bunk bed with rolled blankets. */
export function bunk(): Group {
  const g = new Group();
  const frame = M.steelDark();
  const cloth = M.canvasCloth();
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    g.add(put(cyl(0.035, 0.035, 1.7, frame, 6), x * 0.44, 0.85, z * 0.95));
  }
  for (const y of [0.42, 1.24]) {
    g.add(put(tbox(0.92, 0.06, 1.94, frame, 0.6), 0, y, 0));
    g.add(put(tbox(0.86, 0.14, 1.84, cloth, 0.7), 0, y + 0.1, 0));
    g.add(put(cyl(0.13, 0.13, 0.8, cloth, 8), 0, y + 0.16, -0.78, 0));
  }
  g.add(put(tbox(0.92, 0.05, 0.05, frame), 0, 1.7, -0.95));
  return g;
}

// ---------------------------------------------------------------------------
// Architecture parts
// ---------------------------------------------------------------------------

/** Window: frame, mullions, glass, and a sill. Sits in a wall opening. */
export function windowUnit(width = 1.0, height = 1.2): Group {
  const g = new Group();
  const frame = M.planed();
  const t = 0.08;
  g.add(put(tbox(width, t, 0.2, frame, 0.35), 0, height - t / 2, 0));
  g.add(put(tbox(width, t, 0.24, frame, 0.35), 0, t / 2, 0.02));
  for (const side of [-1, 1]) {
    g.add(put(tbox(t, height, 0.2, frame, 0.35), (side * (width - t)) / 2, height / 2, 0));
  }
  g.add(put(tbox(0.05, height, 0.1, frame, 0.3), 0, height / 2, 0));
  g.add(put(tbox(width, 0.05, 0.1, frame, 0.3), 0, height * 0.55, 0));
  g.add(put(tbox(width - t, height - t, 0.02, M.glass()), 0, height / 2, 0));
  return g;
}

/** Plank door with hinges, a latch and cross-bracing. */
export function door(width = 0.95, height = 2.05, open = 0): Group {
  const pivot = new Group();
  const leaf = new Group();
  const wood = M.planks();
  const iron = M.iron();

  leaf.add(put(tbox(width, height, 0.06, wood, 0.5), width / 2, height / 2, 0));
  for (const y of [height * 0.2, height * 0.8]) {
    leaf.add(put(tbox(width, 0.1, 0.02, M.planksDark(), 0.4), width / 2, y, 0.04));
  }
  const brace = put(
    tbox(Math.hypot(width, height * 0.6), 0.09, 0.02, M.planksDark(), 0.4),
    width / 2,
    height / 2,
    0.04,
  );
  brace.rotation.z = Math.atan2(height * 0.6, width);
  leaf.add(brace);

  for (const y of [height * 0.18, height * 0.82]) {
    leaf.add(put(tbox(0.22, 0.07, 0.03, iron), 0.11, y, 0.045));
  }
  leaf.add(put(tbox(0.14, 0.04, 0.05, iron), width - 0.12, height * 0.5, 0.055));

  pivot.add(leaf);
  pivot.rotation.y = open;
  return pivot;
}

/** Door and window openings need a lining, or the wall reads as cardboard. */
export function frameOpening(width: number, height: number, wallDepth: number): Group {
  const g = new Group();
  const wood = M.planed();
  const t = 0.1;
  for (const side of [-1, 1]) {
    g.add(
      put(tbox(t, height, wallDepth + 0.06, wood, 0.4), (side * (width + t)) / 2, height / 2, 0),
    );
  }
  g.add(put(tbox(width + t * 2, t, wallDepth + 0.06, wood, 0.4), 0, height + t / 2, 0));
  return g;
}

/** Guard rail: posts, top rail, mid rail. */
export function railing(length: number, height = 1.05): Group {
  const g = new Group();
  const steel = M.steelDark();
  const posts = Math.max(2, Math.round(length / 1.5));
  for (let i = 0; i < posts; i++) {
    const x = -length / 2 + (i * length) / (posts - 1);
    g.add(put(cyl(0.035, 0.04, height, steel, 6), x, height / 2, 0));
  }
  g.add(put(tbox(length, 0.055, 0.055, steel, 0.6), 0, height, 0));
  g.add(put(tbox(length, 0.04, 0.04, steel, 0.6), 0, height * 0.52, 0));
  return g;
}

/** Ladder with side rails and rungs. */
export function ladder(height: number): Group {
  const g = new Group();
  const steel = M.steelDark();
  for (const side of [-1, 1]) {
    g.add(put(tbox(0.05, height, 0.05, steel, 0.5), side * 0.21, height / 2, 0));
  }
  const rungs = Math.floor(height / 0.3);
  for (let i = 1; i < rungs; i++) {
    const rung = cyl(0.018, 0.018, 0.42, steel, 6);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(0, i * 0.3, 0);
    g.add(rung);
  }
  return g;
}

/** Run of pipes along a wall, with brackets and flanges. */
export function pipeRun(length: number, count = 2): Group {
  const g = new Group();
  const steel = M.steel();
  const rust = M.rust();
  for (let i = 0; i < count; i++) {
    const y = i * 0.22;
    const pipe = cyl(0.06, 0.06, length, i % 2 ? rust : steel, 8);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, y, 0);
    g.add(pipe);
    const flanges = Math.max(2, Math.round(length / 2.4));
    for (let f = 0; f < flanges; f++) {
      const x = -length / 2 + (f * length) / (flanges - 1);
      const ring = cyl(0.08, 0.08, 0.05, M.steelDark(), 8);
      ring.rotation.z = Math.PI / 2;
      ring.position.set(x, y, 0);
      g.add(ring);
      if (i === 0) g.add(put(tbox(0.05, 0.16, 0.05, M.steelDark()), x, y + 0.1, -0.09));
    }
  }
  return g;
}

/** Conical wall lamp with a warm bulb. */
export function wallLamp(): Group {
  const g = new Group();
  g.add(put(tbox(0.09, 0.09, 0.22, M.steelDark()), 0, 0, -0.11));
  const shade = cyl(0.06, 0.21, 0.2, M.redPaint(), 10);
  shade.position.set(0, -0.1, 0.02);
  g.add(shade);
  g.add(put(cyl(0.06, 0.06, 0.05, M.lampGlow(), 8), 0, -0.2, 0.02));
  return g;
}

/** Snow that has piled against something: a wedge, not a box. */
export function drift(width: number, depth: number, height: number): Mesh {
  const geometry = new BoxGeometry(width, height, depth, 1, 1, 1);
  const pos = geometry.getAttribute('position');
  // Collapse the top-back edge down and forward so the slab becomes a wedge.
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0 && pos.getZ(i) < 0) {
      pos.setY(i, -height / 2);
      pos.setZ(i, pos.getZ(i) * 0.4);
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, M.snow());
  mesh.position.y = height / 2;
  return mesh;
}

// ---------------------------------------------------------------------------
// Outdoors
// ---------------------------------------------------------------------------

/** Snow fence: slatted boards on angled posts. */
export function snowFence(length: number): Group {
  const g = new Group();
  const wood = M.planksDark();
  const posts = Math.max(2, Math.round(length / 2.2));
  for (let i = 0; i < posts; i++) {
    const x = -length / 2 + (i * length) / (posts - 1);
    const post = put(tbox(0.09, 1.5, 0.09, wood, 0.5), x, 0.75, 0);
    post.rotation.z = (i % 2 ? 1 : -1) * 0.03;
    g.add(post);
  }
  const slats = Math.floor(length / 0.24);
  for (let i = 0; i < slats; i++) {
    const x = -length / 2 + 0.12 + i * 0.24;
    const slat = put(tbox(0.1, 1.25, 0.03, wood, 0.4), x, 0.68, 0.05);
    slat.rotation.z = Math.sin(i * 2.3) * 0.03;
    g.add(slat);
  }
  for (const y of [0.35, 1.15]) g.add(put(tbox(length, 0.06, 0.05, wood, 0.6), 0, y, 0.09));
  return g;
}

/** Telegraph pole with a crossarm, insulators and sagging wire stubs. */
export function telegraphPole(height = 7): Group {
  const g = new Group();
  g.add(put(cyl(0.11, 0.16, height, M.bark(), 8), 0, height / 2, 0));
  g.add(put(tbox(1.7, 0.1, 0.1, M.planksDark(), 0.5), 0, height - 0.5, 0));
  g.add(put(tbox(1.1, 0.09, 0.09, M.planksDark(), 0.5), 0, height - 1.1, 0));
  for (const x of [-0.72, -0.24, 0.24, 0.72]) {
    g.add(put(cyl(0.05, 0.06, 0.14, M.glass(), 8), x, height - 0.38, 0));
  }
  for (const x of [-0.45, 0.45]) {
    g.add(put(cyl(0.045, 0.055, 0.12, M.glass(), 8), x, height - 0.98, 0));
  }
  // Diagonal brace under the crossarm — the detail that says "utility pole".
  for (const side of [-1, 1]) {
    const brace = put(tbox(0.7, 0.06, 0.06, M.planksDark(), 0.4), side * 0.3, height - 0.75, 0);
    brace.rotation.z = side * 0.7;
    g.add(brace);
  }
  return g;
}

/** Pine, in three silhouettes, with snow caught on the branches. */
export function pine(scale = 1, variant = 0): Group {
  const g = new Group();
  const rand = mulberry32(Math.round(scale * 1000) + variant * 17);
  const trunkHeight = (1.8 + variant * 0.4) * scale;
  g.add(put(cyl(0.12 * scale, 0.2 * scale, trunkHeight, M.bark(), 7), 0, trunkHeight / 2, 0));

  const tiers = 4 + variant;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const radius = (1.55 - t * 1.15) * scale;
    const tierHeight = (1.9 - t * 0.5) * scale;
    const y = trunkHeight * 0.55 + i * 0.82 * scale;
    const cone = new Mesh(
      new CylinderGeometry(0.02, radius, tierHeight, 8),
      i % 2 ? M.foliage() : M.foliageLight(),
    );
    cone.position.set(0, y + tierHeight / 2, 0);
    cone.rotation.y = rand() * Math.PI;
    g.add(cone);

    // A cap of snow on the upper face of each tier reads instantly as winter.
    const cap = new Mesh(new CylinderGeometry(0.02, radius * 0.78, tierHeight * 0.34, 8), M.snow());
    cap.position.set(0, y + tierHeight * 0.82, 0);
    cap.rotation.y = cone.rotation.y;
    g.add(cap);
  }
  return g;
}

/** A cluster of angled slabs — reads as broken stone, not a grey cube. */
export function rockCluster(scale = 1, seed = 1): Group {
  const g = new Group();
  const rand = mulberry32(seed);
  const rock = M.rock();
  const count = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const w = (0.7 + rand() * 1.5) * scale;
    const h = (0.5 + rand() * 1.3) * scale;
    const d = (0.6 + rand() * 1.2) * scale;
    const slab = tbox(w, h, d, rock, 1.6);
    slab.position.set((rand() - 0.5) * scale * 1.6, h / 2 - 0.1, (rand() - 0.5) * scale * 1.6);
    slab.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4);
    g.add(slab);
    if (rand() < 0.6) {
      const cap = tbox(w * 0.9, 0.12 * scale, d * 0.9, M.snow(), 1.2);
      cap.position.copy(slab.position).setY(slab.position.y + h / 2);
      cap.rotation.copy(slab.rotation);
      g.add(cap);
    }
  }
  return g;
}

/**
 * A stretch of cliff. Built from stacked, rotated slabs of varying size with
 * snow ledges, because a single tall box reads as a grey card no matter what
 * texture you put on it — there are no interior edges for the ink to find.
 */
export function cliff(length: number, height: number, seed = 1): Group {
  const g = new Group();
  const rand = mulberry32(seed);
  const snow = M.snow();
  // Three tones: without variation the face reads as one grey mass no matter
  // how much geometry you throw at it.
  const tones = [
    toon(0x6b7481, { ramp: 'trio', texture: 'rock' }),
    toon(0x78818e, { ramp: 'trio', texture: 'rock' }),
    toon(0x5e6672, { ramp: 'trio', texture: 'rock' }),
  ];

  // Solid backing slab: the broken face in front only has to look good, it
  // never has to be watertight.
  const backing = tbox(length * 1.1, height * 1.25, 3.4, tones[2]!, 3.4);
  backing.position.set(0, (height * 1.25) / 2 - 1, -2.4);
  g.add(backing);

  const columns = Math.max(2, Math.round(length / 5.5));
  for (let c = 0; c < columns; c++) {
    const cx = -length / 2 + (c + 0.5) * (length / columns);
    const columnHeight = height * (0.6 + rand() * 0.55);
    let y = -0.6;

    // Fewer, larger masses, each leaning back into the face so nothing floats.
    while (y < columnHeight) {
      const blockHeight = 3.2 + rand() * 4.5;
      const w = (length / columns) * (1.0 + rand() * 0.5);
      const d = 3.0 + rand() * 2.6;
      const lift = Math.max(0, y) / Math.max(columnHeight, 1);
      const block = tbox(w, blockHeight, d, tones[Math.floor(rand() * 3)]!, 3.0);
      block.position.set(
        cx + (rand() - 0.5) * 1.2,
        y + blockHeight / 2,
        (rand() - 0.5) * 0.8 - lift * 2.2,
      );
      block.rotation.set((rand() - 0.5) * 0.1, (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.09);
      g.add(block);

      // Snow settles on the ledges that step back from the one below.
      if (lift > 0.15 && rand() < 0.75) {
        const ledge = tbox(w * 0.92, 0.2, d * 0.85, snow, 1.8);
        ledge.position.copy(block.position).setY(block.position.y + blockHeight / 2);
        ledge.rotation.copy(block.rotation);
        g.add(ledge);
      }
      // Overlap the next block generously — a visible seam looks like masonry.
      y += blockHeight * (0.6 + rand() * 0.22);
    }

    // Talus at the foot, so the wall meets the ground with a break rather than
    // a clean line.
    const boulder = rockCluster(1.1 + rand() * 0.9, seed * 31 + c);
    boulder.position.set(cx + (rand() - 0.5) * 2.4, 0, 2.0 + rand() * 1.6);
    g.add(boulder);
  }
  return g;
}

/** Distant ridge line: flat, unlit silhouettes that give the valley depth. */
export function mountainRange(radius: number, seed = 5): Group {
  const g = new Group();
  const rand = mulberry32(seed);
  // Fog is switched off on these: they sit far past the fog's far plane, and
  // fogging them to the sky colour leaves only their inked outline visible,
  // which reads as a wireframe rather than as a ridge.
  const near = toon(0x5b6e85, { ramp: 'flat' });
  const far = toon(0x7e91a6, { ramp: 'flat' });
  const snowCap = toon(0xd6e2ee, { ramp: 'flat' });
  for (const m of [near, far, snowCap]) m.fog = false;

  // Two rings at different distances and values: the near ridge reads as rock,
  // the far one as haze. One ring alone looks like cardboard cut-outs.
  for (let ring = 0; ring < 2; ring++) {
    const r = radius * (1 + ring * 0.4);
    const material = ring === 0 ? near : far;
    const peaks = 30;
    for (let i = 0; i < peaks; i++) {
      const angle = (i / peaks) * Math.PI * 2 + rand() * 0.14;
      const height = (95 + rand() * 105) * (1 + ring * 0.25);
      const width = (110 + rand() * 130) * (1 + ring * 0.2);
      const peak = new Mesh(new CylinderGeometry(0.01, width / 2, height, 4), material);
      // Base is buried well below the valley floor so no ridge appears to float.
      peak.position.set(Math.cos(angle) * r, height / 2 - 46, Math.sin(angle) * r);
      peak.rotation.y = rand() * Math.PI;
      g.add(peak);

      // Snow line: a smaller cone capping the top third of the same peak.
      if (ring === 0 && rand() < 0.7) {
        const capHeight = height * 0.34;
        const cap = new Mesh(new CylinderGeometry(0.01, (width / 2) * 0.34, capHeight, 4), snowCap);
        cap.position.copy(peak.position).setY(peak.position.y + height / 2 - capHeight / 2);
        cap.rotation.y = peak.rotation.y;
        g.add(cap);
      }
    }
  }
  g.renderOrder = -500;
  return g;
}

/**
 * The cable car — glazed cabin, roof, hanger arm and bogie.
 *
 * `openFront` tears the -Z end wide open: the chapter starts inside a wrecked
 * one, and the player has to be able to walk straight out of it rather than
 * vault a sill.
 */
export function gondola(colour = 0x9d3a2f, openFront = false): Group {
  const g = new Group();
  const shell = toon(colour, { ramp: 'duo', texture: 'metal' });
  const steel = M.steelDark();

  g.add(put(tbox(2.2, 0.14, 2.8, steel, 0.9), 0, 0.07, 0));
  for (const side of [-1, 1]) {
    g.add(put(tbox(0.1, 2.1, 2.8, shell, 0.9), side * 1.05, 1.1, 0));
  }
  g.add(put(tbox(2.2, 2.1, 0.1, shell, 0.9), 0, 1.1, 1.35));

  if (openFront) {
    // Torn lip and two ragged stubs of the missing wall.
    g.add(put(tbox(2.2, 0.16, 0.12, shell, 0.6), 0, 0.22, -1.35));
    g.add(put(tbox(0.42, 1.6, 0.11, shell, 0.6), -0.89, 1.1, -1.35));
    const shard = put(tbox(0.5, 0.9, 0.1, shell, 0.5), 0.82, 1.5, -1.35);
    shard.rotation.z = 0.22;
    g.add(shard);
  } else {
    g.add(put(tbox(2.2, 0.55, 0.1, shell, 0.9), 0, 1.88, -1.35));
    g.add(put(tbox(2.2, 0.5, 0.1, shell, 0.9), 0, 0.35, -1.35));
  }
  // Glazing on the sides, and on the back wall when it is intact.
  const panes: Array<readonly [number, number, number]> = [
    [-1.0, 0, Math.PI / 2],
    [1.0, 0, Math.PI / 2],
  ];
  if (!openFront) panes.push([0, 1.3, 0] as const);
  for (const [x, z, ry] of panes) {
    g.add(put(tbox(2.4, 1.0, 0.03, M.glass()), x, 1.2, z, ry));
  }
  g.add(put(tbox(2.4, 0.16, 3.0, steel, 1.0), 0, 2.24, 0));
  g.add(put(tbox(0.18, 1.0, 0.18, steel, 0.5), 0, 2.8, 0));
  g.add(put(tbox(0.9, 0.2, 0.24, steel, 0.5), 0, 3.34, 0));
  for (const x of [-0.32, 0.32]) {
    const wheel = cyl(0.2, 0.2, 0.1, M.steel(), 12);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 3.5, 0);
    g.add(wheel);
  }
  // Bench inside, so the cabin isn't hollow.
  g.add(put(tbox(2.0, 0.08, 0.42, M.planed(), 0.6), 0, 0.52, -1.05));
  g.add(put(tbox(2.0, 0.5, 0.08, M.planed(), 0.6), 0, 0.78, -1.28));
  return g;
}

/** Lattice pylon with a cable head and a maintenance ladder. */
export function pylon(height: number): Group {
  const g = new Group();
  const steel = M.steel();
  const dark = M.steelDark();
  const legs: Array<[number, number]> = [
    [-1.1, -1.1],
    [1.1, -1.1],
    [-1.1, 1.1],
    [1.1, 1.1],
  ];
  for (const [ox, oz] of legs) {
    const leg = put(tbox(0.2, height, 0.2, steel, 1.4), ox, height / 2, oz);
    g.add(leg);
  }
  const bays = Math.max(3, Math.round(height / 2.2));
  for (let i = 1; i <= bays; i++) {
    const y = (height / bays) * i;
    for (const z of [-1.1, 1.1]) {
      g.add(put(tbox(2.3, 0.1, 0.1, dark, 0.8), 0, y, z));
      const brace = put(tbox(2.6, 0.07, 0.07, dark, 0.8), 0, y - height / bays / 2, z);
      brace.rotation.z = Math.atan2(height / bays, 2.2) * (i % 2 ? 1 : -1);
      g.add(brace);
    }
    for (const x of [-1.1, 1.1]) {
      const cross = put(tbox(0.1, 0.1, 2.3, dark, 0.8), x, y, 0);
      g.add(cross);
    }
  }
  g.add(put(tbox(3.6, 0.3, 0.9, dark, 1.0), 0, height + 0.15, 0));
  for (const x of [-1.4, -0.7, 0, 0.7, 1.4]) {
    const wheel = cyl(0.3, 0.3, 0.16, steel, 12);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, height + 0.5, 0);
    g.add(wheel);
  }
  const climb = ladder(height);
  climb.position.set(1.1, 0, 1.3);
  g.add(climb);
  return g;
}

/** Big cable drum on a frame, for the winch house. */
export function winchDrum(): Group {
  const g = new Group();
  const steel = M.steel();
  const dark = M.steelDark();
  for (const side of [-1, 1]) {
    g.add(put(tbox(0.24, 1.5, 0.9, dark, 0.7), side * 1.25, 0.75, 0));
  }
  const barrel = cyl(0.62, 0.62, 2.1, steel, 14);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.y = 1.35;
  g.add(barrel);
  for (const x of [-1.05, 1.05]) {
    const flange = cyl(0.8, 0.8, 0.1, dark, 14);
    flange.rotation.z = Math.PI / 2;
    flange.position.set(x, 1.35, 0);
    g.add(flange);
  }
  // Wound cable: a stack of thin rings reads as coiled wire.
  for (let i = 0; i < 9; i++) {
    const coil = cyl(0.68, 0.68, 0.07, M.iron(), 14);
    coil.rotation.z = Math.PI / 2;
    coil.position.set(-0.85 + i * 0.21, 1.35, 0);
    g.add(coil);
  }
  g.add(put(tbox(0.5, 0.7, 0.5, M.rust(), 0.5), 1.6, 1.1, 0));
  return g;
}

/** Wall-mounted breaker cabinet with a big throw lever. */
export function breakerBox(on = false): Group {
  const g = new Group();
  g.add(put(tbox(0.7, 1.0, 0.28, M.rust(), 0.6), 0, 0.5, 0));
  g.add(put(tbox(0.6, 0.88, 0.03, M.steelDark(), 0.4), 0, 0.5, 0.155));
  for (let i = 0; i < 3; i++) {
    g.add(put(tbox(0.1, 0.18, 0.05, M.iron()), -0.16 + i * 0.16, 0.72, 0.18));
  }
  const lever = put(tbox(0.09, 0.34, 0.09, on ? M.lampGlow() : M.redPaint()), 0, 0.34, 0.2);
  lever.rotation.x = on ? -0.5 : 0.5;
  g.add(lever);
  g.add(put(cyl(0.05, 0.05, 0.03, on ? M.lampGlow() : M.iron(), 8), 0.22, 0.34, 0.19));
  return g;
}

export const KIT_ORIGIN = new Vector3();
