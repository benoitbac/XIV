import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshToonMaterial } from 'three';
import { toon } from '../render/toon.ts';
import { Rig, type JointName } from './rig.ts';

/**
 * Builds a body onto a rig.
 *
 * Every part hangs off a joint, so the animation system moves the figure rather
 * than the figure being reassembled each frame. The shapes are deliberately
 * simple — the ink pass draws the detail — but the *proportions* are not: small
 * head, wide shoulders, a coat that flares below the belt, and a real neck.
 * Those three things are the difference between a person and a stack of boxes.
 */

export interface HumanoidPalette {
  coat: number;
  coatDark: number;
  trousers: number;
  accent: number;
  skin: number;
  leather: number;
  metal: number;
  wood: number;
}

export interface HumanoidOptions {
  palette: HumanoidPalette;
  /** Helmet instead of a knitted cap. */
  helmet: boolean;
  /** Long coat skirt — reads as an officer rather than a trooper. */
  greatcoat?: boolean;
  /** Builds and attaches a rifle to the right hand. */
  rifle?: boolean;
}

function box(w: number, h: number, d: number, material: MeshToonMaterial): Mesh {
  return new Mesh(new BoxGeometry(w, h, d), material);
}

/**
 * A slightly tapered limb segment. Taper costs nothing and does more for the
 * silhouette than any amount of extra geometry.
 */
function limb(
  topWidth: number,
  bottomWidth: number,
  length: number,
  depth: number,
  material: MeshToonMaterial,
): Mesh {
  const geometry = new BoxGeometry(topWidth, length, depth);
  const pos = geometry.getAttribute('position');
  const scale = bottomWidth / topWidth;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0) {
      pos.setX(i, pos.getX(i) * scale);
      pos.setZ(i, pos.getZ(i) * scale);
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return new Mesh(geometry, material);
}

export function buildHumanoid(options: HumanoidOptions): { rig: Rig; rifle: Group | null } {
  const p = options.palette;
  const rig = new Rig();

  const coat = toon(p.coat, { ramp: 'trio' });
  const coatDark = toon(p.coatDark, { ramp: 'trio' });
  const trousers = toon(p.trousers, { ramp: 'trio' });
  const accent = toon(p.accent, { ramp: 'trio' });
  const skin = toon(p.skin, { ramp: 'trio' });
  const leather = toon(p.leather, { ramp: 'trio' });
  const metal = toon(p.metal, { ramp: 'trio' });
  const wood = toon(p.wood, { ramp: 'trio' });

  // --- torso ---------------------------------------------------------------
  rig.attach('pelvis', box(0.34, 0.2, 0.24, trousers), [0, -0.02, 0]);
  rig.attach('pelvis', box(0.38, 0.07, 0.26, leather), [0, 0.06, 0], { hitbox: false });
  rig.attach('pelvis', box(0.08, 0.08, 0.04, accent), [0, 0.06, 0.14], { hitbox: false });

  rig.attach('spine', box(0.38, 0.24, 0.24, coat), [0, 0.09, 0]);
  rig.attach('chest', limb(0.46, 0.4, 0.3, 0.27, coat), [0, 0.11, 0]);

  // Coat skirt hangs from the pelvis so it swings with the hips, not the chest.
  const skirtLength = options.greatcoat ? 0.52 : 0.3;
  rig.attach(
    'pelvis',
    limb(0.4, 0.46, skirtLength, 0.3, coatDark),
    [0, -0.16 - skirtLength / 2, 0],
    {
      hitbox: false,
    },
  );

  // Shoulder yoke: one wide block across both clavicles.
  rig.attach('chest', box(0.58, 0.13, 0.29, coat), [0, 0.2, 0], { hitbox: false });
  rig.attach('chest', box(0.3, 0.09, 0.25, accent), [0, 0.27, 0], { hitbox: false });

  rig.attach('neck', box(0.13, 0.1, 0.13, skin), [0, 0.02, 0], { hitbox: false });

  // --- head ----------------------------------------------------------------
  rig.attach('head', box(0.2, 0.23, 0.21, skin), [0, 0.1, 0]);
  rig.attach('head', box(0.14, 0.05, 0.02, coatDark), [0, 0.13, -0.11], { hitbox: false });
  if (options.helmet) {
    rig.attach('head', limb(0.26, 0.25, 0.13, 0.26, coatDark), [0, 0.24, 0], { hitbox: false });
    rig.attach('head', box(0.27, 0.03, 0.09, coatDark), [0, 0.19, -0.13], { hitbox: false });
    rig.attach('head', box(0.05, 0.05, 0.03, accent), [0.1, 0.24, -0.08], { hitbox: false });
  } else {
    rig.attach('head', box(0.22, 0.09, 0.23, coatDark), [0, 0.24, 0], { hitbox: false });
    rig.attach('head', box(0.23, 0.05, 0.24, accent), [0, 0.19, 0], { hitbox: false });
  }

  // --- arms ----------------------------------------------------------------
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? -1 : 1;
    rig.attach(`upperArm${side}` as JointName, limb(0.14, 0.12, 0.28, 0.15, coat), [0, -0.14, 0]);
    rig.attach(`forearm${side}` as JointName, limb(0.12, 0.1, 0.26, 0.13, coat), [0, -0.13, 0]);
    rig.attach(`hand${side}` as JointName, box(0.1, 0.11, 0.1, leather), [0, -0.05, 0]);
    // Cuff: a band where the sleeve meets the glove.
    rig.attach(`forearm${side}` as JointName, box(0.13, 0.05, 0.14, coatDark), [0, -0.24, 0], {
      hitbox: false,
    });
    rig.attach(`clavicle${side}` as JointName, box(0.13, 0.12, 0.2, coat), [sign * 0.04, 0, 0], {
      hitbox: false,
    });
  }

  // --- legs ----------------------------------------------------------------
  for (const side of ['L', 'R'] as const) {
    rig.attach(`thigh${side}` as JointName, limb(0.17, 0.15, 0.42, 0.19, trousers), [0, -0.21, 0]);
    rig.attach(`shin${side}` as JointName, limb(0.15, 0.13, 0.4, 0.17, trousers), [0, -0.2, 0]);
    // Boot: sole forward of the ankle so the foot has a heel and a toe.
    rig.attach(`foot${side}` as JointName, box(0.15, 0.1, 0.28, leather), [0, -0.04, 0.05]);
    rig.attach(`foot${side}` as JointName, box(0.16, 0.04, 0.3, coatDark), [0, -0.08, 0.05], {
      hitbox: false,
    });
    rig.attach(`shin${side}` as JointName, box(0.17, 0.09, 0.19, leather), [0, -0.36, 0], {
      hitbox: false,
    });
  }

  // --- weapon --------------------------------------------------------------
  let rifle: Group | null = null;
  if (options.rifle !== false) {
    rifle = new Group();
    rifle.name = 'rifle';
    const parts: Array<[number, number, number, number, number, number, MeshToonMaterial]> = [
      [0.045, 0.045, 0.62, 0, 0.01, -0.24, metal], // barrel
      [0.065, 0.1, 0.28, 0, 0, 0.1, metal], // receiver
      [0.055, 0.12, 0.26, 0, -0.04, 0.35, wood], // stock
      [0.05, 0.17, 0.07, 0, -0.14, 0.12, metal], // magazine
      [0.018, 0.045, 0.018, 0, 0.07, -0.5, metal], // front sight
      [0.05, 0.05, 0.14, 0, -0.02, -0.12, wood], // fore-end
    ];
    for (const [w, h, d, x, y, z, mat] of parts) {
      const piece = new Mesh(new BoxGeometry(w, h, d), mat);
      piece.position.set(x, y, z);
      piece.castShadow = true;
      rifle.add(piece);
    }
    const sling = new Mesh(
      new CylinderGeometry(0.012, 0.012, 0.6, 5),
      toon(p.leather, { ramp: 'flat' }),
    );
    sling.rotation.x = Math.PI / 2.6;
    sling.position.set(0, -0.1, 0.06);
    rifle.add(sling);

    // Held in the right hand; the left hand's aim pose brings it onto the fore-end.
    rifle.position.set(0, -0.07, -0.05);
    rifle.rotation.set(0, 0, 0);
    rig.joint('handR').add(rifle);
  }

  return { rig, rifle };
}
