import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshToonMaterial, Object3D } from 'three';
import { toon } from '../render/toon.ts';
import type { WeaponId } from './weapons.ts';

/**
 * First-person weapon models.
 *
 * This is the only art in the game that is on screen every single frame, so it
 * gets the most detail per polygon of anything here. Two things matter more
 * than the shapes themselves:
 *
 *  - **Moving parts.** A slide that cycles, a hammer that falls, a magazine
 *    that actually drops out. A gun whose only feedback is the whole model
 *    jerking backwards reads as a prop.
 *  - **Hands that grip.** Fingers wrapped round the grip and the fore-end,
 *    thumb along the frame. A floating cube next to a gun is the single
 *    cheapest-looking thing a first-person game can put in front of you.
 */

export interface WeaponParts {
  root: Group;
  /** Reciprocating mass: slide, bolt or pump. Animated on fire. */
  slide: Object3D | null;
  /** Drops out and is replaced during a reload. */
  magazine: Object3D | null;
  /** Falls when the trigger breaks. */
  hammer: Object3D | null;
  /** Local-space muzzle, for the flash and tracer origin. */
  muzzle: [number, number, number];
  /** Local-space ejection port, for shell casings. */
  ejector: [number, number, number];
}

const M = {
  gunmetal: () => toon(0x2b2f36, { ramp: 'trio', texture: 'metal' }),
  steel: () => toon(0x484f59, { ramp: 'trio', texture: 'metal' }),
  blued: () => toon(0x1e2228, { ramp: 'trio' }),
  brass: () => toon(0x9c7d34, { ramp: 'trio' }),
  wood: () => toon(0x5b3f27, { ramp: 'trio', texture: 'planed' }),
  woodDark: () => toon(0x3f2b1a, { ramp: 'trio', texture: 'planed' }),
  grip: () => toon(0x24262a, { ramp: 'trio' }),
  glove: () => toon(0x2c333c, { ramp: 'trio' }),
  gloveDark: () => toon(0x1d2228, { ramp: 'trio' }),
  skin: () => toon(0xc08a5c, { ramp: 'trio' }),
};

function box(
  w: number,
  h: number,
  d: number,
  material: MeshToonMaterial,
  x = 0,
  y = 0,
  z = 0,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function tube(
  radius: number,
  length: number,
  material: MeshToonMaterial,
  x = 0,
  y = 0,
  z = 0,
  segments = 10,
): Mesh {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, segments), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * A gloved hand wrapped round something.
 *
 * `spread` opens the fingers for a fore-end grip; `roll` cants the whole hand.
 * The fingers are one block with cut lines rather than four separate digits —
 * at this size the ink pass draws the separation and nobody counts them.
 */
function hand(options: { spread?: number; roll?: number; thumbUp?: boolean } = {}): Group {
  const g = new Group();
  const glove = M.glove();
  const dark = M.gloveDark();
  const skin = M.skin();

  // Back of the hand.
  g.add(box(0.075, 0.055, 0.1, glove, 0, 0, 0));
  // Wrist and cuff.
  g.add(box(0.07, 0.06, 0.07, dark, 0, 0.005, 0.085));
  g.add(box(0.082, 0.07, 0.03, glove, 0, 0.005, 0.115));

  // Fingers: four bands curling under, each slightly shorter than the last.
  const spread = options.spread ?? 0;
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const finger = new Group();
    const length = 0.055 - t * 0.008;
    finger.add(box(0.017, 0.02, length, glove, 0, 0, -length / 2));
    finger.add(box(0.016, 0.018, 0.04, glove, 0, -0.018, -length - 0.012));
    finger.position.set(-0.026 + i * 0.018, -0.012, -0.045);
    finger.rotation.x = 1.15 - spread * (0.9 - t * 0.2);
    g.add(finger);
  }

  // Thumb, laid along the side or up the frame.
  const thumb = new Group();
  thumb.add(box(0.02, 0.022, 0.05, glove, 0, 0, -0.025));
  thumb.add(box(0.018, 0.02, 0.036, skin, 0, 0, -0.066));
  thumb.position.set(0.038, -0.004, -0.03);
  thumb.rotation.set(options.thumbUp ? 0.2 : 0.85, -0.55, 0);
  g.add(thumb);

  g.rotation.z = options.roll ?? 0;
  return g;
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

function buildColt(): WeaponParts {
  const root = new Group();
  const metal = M.gunmetal();
  const steel = M.steel();

  // Frame and dust cover.
  root.add(box(0.036, 0.032, 0.19, steel, 0, -0.028, -0.045));
  root.add(box(0.03, 0.022, 0.1, steel, 0, -0.046, -0.09));

  // Slide: the whole upper, which is what reciprocates.
  const slide = new Group();
  slide.add(box(0.042, 0.045, 0.215, metal, 0, 0, -0.05));
  slide.add(box(0.044, 0.012, 0.06, metal, 0, 0.014, 0.03)); // rear serrations block
  slide.add(box(0.012, 0.016, 0.01, steel, 0, 0.03, -0.15)); // front sight
  slide.add(box(0.02, 0.014, 0.012, steel, 0, 0.03, 0.045)); // rear sight
  // Ejection port: a notch cut by sitting two blocks either side of a gap.
  slide.add(box(0.008, 0.03, 0.05, M.blued(), 0.021, 0.004, -0.02));
  root.add(slide);

  // Barrel bushing and muzzle.
  root.add(tube(0.014, 0.05, M.blued(), 0, 0, -0.165, 8));

  // Grip, canted back, with chequered panels.
  const grip = new Group();
  grip.add(box(0.038, 0.125, 0.05, M.grip(), 0, -0.062, 0));
  grip.add(box(0.042, 0.09, 0.012, M.woodDark(), 0, -0.06, 0.026));
  grip.add(box(0.042, 0.09, 0.012, M.woodDark(), 0, -0.06, -0.026));
  grip.position.set(0, -0.045, 0.045);
  grip.rotation.x = -0.28;
  root.add(grip);

  // Trigger guard and trigger.
  root.add(box(0.03, 0.008, 0.055, steel, 0, -0.082, -0.018));
  root.add(box(0.026, 0.008, 0.008, steel, 0, -0.09, -0.045));
  root.add(box(0.01, 0.026, 0.008, M.blued(), 0, -0.062, -0.02));

  const hammer = new Group();
  hammer.add(box(0.012, 0.028, 0.01, steel, 0, 0.014, 0));
  hammer.position.set(0, -0.012, 0.078);
  root.add(hammer);

  const magazine = box(0.03, 0.11, 0.04, M.blued(), 0, -0.108, 0.052);
  magazine.rotation.x = -0.28;
  root.add(magazine);

  // Right hand on the grip, left hand cupping underneath.
  const right = hand({ roll: 0.1 });
  right.position.set(0.012, -0.075, 0.075);
  right.rotation.set(-0.28, 0, 0);
  root.add(right);

  const left = hand({ spread: 0.25, roll: -0.5, thumbUp: true });
  left.position.set(-0.045, -0.088, 0.055);
  left.rotation.set(-0.3, 0.3, -0.4);
  root.add(left);

  return {
    root,
    slide,
    magazine,
    hammer,
    muzzle: [0, 0, -0.2],
    ejector: [0.03, 0.01, -0.02],
  };
}

function buildSilenced(): WeaponParts {
  const parts = buildColt();
  const can = tube(0.032, 0.2, M.blued(), 0, 0, -0.27, 12);
  parts.root.add(can);
  // Rings along the suppressor body give the ink pass something to draw.
  for (const z of [-0.19, -0.25, -0.31]) {
    parts.root.add(tube(0.035, 0.012, M.gunmetal(), 0, 0, z, 12));
  }
  parts.muzzle = [0, 0, -0.37];
  return parts;
}

function buildSmg(): WeaponParts {
  const root = new Group();
  const metal = M.gunmetal();
  const steel = M.steel();

  // Receiver tube with a top rail.
  root.add(tube(0.032, 0.3, metal, 0, 0.005, -0.06, 12));
  root.add(box(0.03, 0.014, 0.26, steel, 0, 0.04, -0.06));
  for (let i = 0; i < 7; i++) {
    root.add(box(0.034, 0.006, 0.008, M.blued(), 0, 0.05, -0.17 + i * 0.038));
  }

  // Bolt: the charging handle rides on the left and cycles with the shot.
  const slide = new Group();
  slide.add(box(0.014, 0.014, 0.07, steel, -0.036, 0.012, 0.02));
  slide.add(box(0.03, 0.02, 0.03, steel, -0.02, 0.012, 0.045));
  root.add(slide);

  root.add(tube(0.014, 0.16, M.blued(), 0, 0.005, -0.26, 8));
  // Perforated barrel shroud.
  root.add(tube(0.026, 0.13, steel, 0, 0.005, -0.25, 10));
  for (let i = 0; i < 5; i++) {
    root.add(box(0.056, 0.008, 0.008, M.blued(), 0, 0.005, -0.3 + i * 0.026));
  }

  const magazine = new Group();
  magazine.add(box(0.036, 0.18, 0.055, M.blued(), 0, -0.09, 0));
  magazine.add(box(0.04, 0.02, 0.06, steel, 0, -0.185, 0));
  magazine.position.set(0, -0.03, -0.03);
  magazine.rotation.x = 0.08;
  root.add(magazine);

  // Pistol grip and folding stock.
  const grip = new Group();
  grip.add(box(0.036, 0.11, 0.048, M.grip(), 0, -0.055, 0));
  grip.position.set(0, -0.03, 0.085);
  grip.rotation.x = -0.24;
  root.add(grip);
  root.add(box(0.026, 0.03, 0.14, steel, 0, 0.005, 0.2));
  root.add(box(0.09, 0.02, 0.03, steel, 0, 0.005, 0.28));

  root.add(box(0.03, 0.008, 0.05, steel, 0, -0.038, 0.05));
  root.add(box(0.01, 0.024, 0.008, M.blued(), 0, -0.02, 0.048));

  const right = hand({ roll: 0.08 });
  right.position.set(0.012, -0.06, 0.115);
  right.rotation.set(-0.24, 0, 0);
  root.add(right);

  // Left hand on the magazine well — the way these are actually carried.
  const left = hand({ spread: 0.15, roll: -0.35, thumbUp: true });
  left.position.set(-0.035, -0.075, -0.04);
  left.rotation.set(-0.15, 0.25, -0.55);
  root.add(left);

  return {
    root,
    slide,
    magazine,
    hammer: null,
    muzzle: [0, 0.005, -0.34],
    ejector: [0.035, 0.012, 0.01],
  };
}

function buildShotgun(): WeaponParts {
  const root = new Group();
  const steel = M.steel();

  root.add(tube(0.024, 0.44, M.blued(), 0, 0.028, -0.2, 12));
  root.add(box(0.05, 0.07, 0.2, M.gunmetal(), 0, 0, 0.02)); // receiver
  root.add(box(0.052, 0.012, 0.06, steel, 0, 0.038, 0.03));
  root.add(tube(0.016, 0.36, steel, 0, -0.02, -0.18, 8)); // magazine tube

  // Pump: slides back and forward between shots.
  const slide = new Group();
  slide.add(tube(0.034, 0.12, M.woodDark(), 0, -0.008, 0, 12));
  for (let i = 0; i < 4; i++) {
    slide.add(tube(0.036, 0.008, M.wood(), 0, -0.008, -0.04 + i * 0.026, 12));
  }
  slide.position.set(0, 0, -0.19);
  root.add(slide);

  // Stock: wrist and butt, canted down.
  const stock = new Group();
  stock.add(box(0.044, 0.075, 0.16, M.wood(), 0, -0.03, 0.09));
  stock.add(box(0.05, 0.11, 0.06, M.wood(), 0, -0.06, 0.2));
  stock.add(box(0.052, 0.115, 0.014, M.blued(), 0, -0.062, 0.232));
  stock.position.set(0, 0, 0.06);
  stock.rotation.x = 0.14;
  root.add(stock);

  root.add(box(0.03, 0.008, 0.05, steel, 0, -0.042, 0.05));
  root.add(box(0.01, 0.024, 0.008, M.blued(), 0, -0.026, 0.048));
  root.add(box(0.012, 0.014, 0.01, steel, 0, 0.05, -0.4)); // bead sight

  const right = hand({ roll: 0.06 });
  right.position.set(0.012, -0.055, 0.095);
  right.rotation.set(-0.18, 0, 0);
  root.add(right);

  // Left hand rides the pump, so it must be parented to it.
  const left = hand({ spread: 0.4, roll: -0.6 });
  left.position.set(-0.03, -0.05, 0.0);
  left.rotation.set(-0.1, 0.2, -0.7);
  slide.add(left);

  return {
    root,
    slide,
    magazine: null,
    hammer: null,
    muzzle: [0, 0.028, -0.42],
    ejector: [0.035, 0.01, 0.02],
  };
}

function buildRifle(): WeaponParts {
  const root = new Group();
  const steel = M.steel();

  root.add(tube(0.015, 0.66, M.blued(), 0, 0.022, -0.3, 10));
  root.add(box(0.042, 0.06, 0.24, M.gunmetal(), 0, 0, -0.02)); // action

  // Wooden stock in two pieces: fore-end and butt with a cheek rise.
  root.add(box(0.05, 0.055, 0.34, M.wood(), 0, -0.028, -0.24));
  const butt = new Group();
  butt.add(box(0.048, 0.085, 0.26, M.wood(), 0, -0.03, 0.17));
  butt.add(box(0.05, 0.11, 0.07, M.wood(), 0, -0.055, 0.3));
  butt.add(box(0.052, 0.115, 0.014, M.blued(), 0, -0.058, 0.335));
  butt.rotation.x = 0.1;
  root.add(butt);

  // Scope on rings.
  root.add(tube(0.026, 0.24, M.blued(), 0, 0.075, -0.06, 12));
  root.add(tube(0.032, 0.05, M.blued(), 0, 0.075, -0.16, 12));
  root.add(tube(0.03, 0.04, M.blued(), 0, 0.075, 0.04, 12));
  for (const z of [-0.12, 0.0]) root.add(box(0.03, 0.05, 0.018, steel, 0, 0.05, z));

  // Bolt handle: cycles after each shot.
  const slide = new Group();
  slide.add(box(0.018, 0.018, 0.09, steel, 0.03, 0.01, 0.03));
  slide.add(box(0.026, 0.026, 0.026, steel, 0.052, 0.01, 0.068));
  root.add(slide);

  root.add(box(0.028, 0.008, 0.05, steel, 0, -0.04, 0.01));
  root.add(box(0.01, 0.024, 0.008, M.blued(), 0, -0.024, 0.008));
  root.add(box(0.036, 0.05, 0.06, M.blued(), 0, -0.045, -0.04)); // floorplate

  const right = hand({ roll: 0.05 });
  right.position.set(0.012, -0.05, 0.075);
  right.rotation.set(-0.14, 0, 0);
  root.add(right);

  const left = hand({ spread: 0.45, roll: -0.6 });
  left.position.set(-0.03, -0.06, -0.26);
  left.rotation.set(-0.08, 0.18, -0.7);
  root.add(left);

  return {
    root,
    slide,
    magazine: null,
    hammer: null,
    muzzle: [0, 0.022, -0.62],
    ejector: [0.03, 0.02, 0.02],
  };
}

function buildFists(): WeaponParts {
  const root = new Group();
  // Both hands closed, held ready rather than hanging.
  const right = hand({ roll: 0.25 });
  right.position.set(0.09, -0.07, -0.02);
  right.rotation.set(0.25, -0.4, 0.3);
  root.add(right);

  const left = hand({ roll: -0.25 });
  left.position.set(-0.11, -0.12, 0.04);
  left.rotation.set(0.15, 0.45, -0.3);
  root.add(left);

  return {
    root,
    slide: null,
    magazine: null,
    hammer: null,
    muzzle: [0, 0, -0.2],
    ejector: [0, 0, 0],
  };
}

function buildGrapnel(): WeaponParts {
  const root = new Group();
  const steel = M.steel();
  root.add(box(0.08, 0.09, 0.16, M.gunmetal(), 0, -0.02, -0.04));
  const spool = tube(0.05, 0.05, steel, 0, 0.03, 0.02, 12);
  spool.rotation.set(0, 0, Math.PI / 2);
  root.add(spool);
  root.add(box(0.02, 0.09, 0.02, steel, 0, 0.02, -0.15));
  root.add(box(0.06, 0.02, 0.02, steel, 0, 0.055, -0.16));
  root.add(box(0.034, 0.1, 0.044, M.grip(), 0, -0.09, 0.02));

  const right = hand({ roll: 0.1 });
  right.position.set(0.012, -0.1, 0.05);
  right.rotation.set(-0.2, 0, 0);
  root.add(right);

  return {
    root,
    slide: null,
    magazine: null,
    hammer: null,
    muzzle: [0, 0.02, -0.2],
    ejector: [0, 0, 0],
  };
}

const BUILDERS: Record<WeaponId, () => WeaponParts> = {
  fists: buildFists,
  colt: buildColt,
  silenced: buildSilenced,
  smg: buildSmg,
  shotgun: buildShotgun,
  rifle: buildRifle,
  grapnel: buildGrapnel,
};

export function buildWeaponModel(id: WeaponId): WeaponParts {
  const parts = BUILDERS[id]();
  parts.root.traverse((o) => {
    if (o instanceof Mesh) {
      // The view model sits centimetres from the near plane; shadow-mapping it
      // would throw a house-sized shadow across the level.
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return parts;
}
