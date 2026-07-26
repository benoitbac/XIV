import { JOINT_NAMES, mirrorJoint, type JointName } from './rig.ts';

/**
 * The animation library.
 *
 * Clips are authored as keyframed Euler rotations per joint. Everything is
 * hand-timed rather than driven by a sine wave: a sine walk is instantly
 * readable as "programmer animation" because every joint peaks at the same
 * instant. Real gait has the knee lagging the hip, the heel striking before the
 * weight transfers, and the chest counter-rotating against the pelvis.
 */

/** `[time 0..1, rotX, rotY, rotZ]`, radians. */
export type Key = readonly [number, number, number, number];
export type Tracks = Partial<Record<JointName, readonly Key[]>>;

export interface Clip {
  name: string;
  /** Seconds for one full pass. */
  duration: number;
  loop: boolean;
  /** Joint index → keys, packed for cheap sampling. */
  tracks: Map<number, readonly Key[]>;
}

const jointIndex = new Map<JointName, number>(JOINT_NAMES.map((n, i) => [n, i]));

export const JOINT_COUNT = JOINT_NAMES.length;

function clip(name: string, duration: number, loop: boolean, tracks: Tracks): Clip {
  const packed = new Map<number, readonly Key[]>();
  for (const [joint, keys] of Object.entries(tracks) as Array<[JointName, readonly Key[]]>) {
    const index = jointIndex.get(joint);
    if (index !== undefined && keys.length > 0) packed.set(index, keys);
  }
  return { name, duration, loop, tracks: packed };
}

/**
 * Copies a set of tracks onto the opposite limbs, shifted half a cycle.
 *
 * A walk is symmetric; authoring both legs by hand doubles the work and
 * guarantees they drift out of sync the first time the timing is tweaked.
 * Y and Z rotations are negated because the mirrored limb turns the other way.
 */
function mirrored(tracks: Tracks, phase = 0.5): Tracks {
  const out: Tracks = { ...tracks };
  for (const [joint, keys] of Object.entries(tracks) as Array<[JointName, readonly Key[]]>) {
    const other = mirrorJoint(joint);
    if (other === joint) continue;
    const shifted = keys
      .map(([t, x, y, z]) => [(t + phase) % 1, x, -y, -z] as Key)
      .sort((a, b) => a[0] - b[0]);
    // Re-close the loop so sampling across t=1 doesn't snap.
    const first = shifted[0]!;
    const last = shifted[shifted.length - 1]!;
    if (first[0] > 0) shifted.unshift([0, last[1], last[2], last[3]]);
    if (last[0] < 1) shifted.push([1, first[1], first[2], first[3]]);
    out[other] = shifted;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Locomotion
// ---------------------------------------------------------------------------

const WALK_LEFT: Tracks = {
  // Hip drives forward first; the knee follows a beat later, which is what
  // makes the leg look like it is being swung rather than rotated.
  thighL: [
    [0.0, 0.52, 0, 0],
    [0.25, 0.1, 0, 0],
    [0.5, -0.42, 0, 0],
    [0.75, -0.12, 0, 0],
    [1.0, 0.52, 0, 0],
  ],
  shinL: [
    [0.0, -0.1, 0, 0],
    [0.15, -0.04, 0, 0],
    [0.45, -0.28, 0, 0],
    [0.62, -0.95, 0, 0],
    [0.82, -0.5, 0, 0],
    [1.0, -0.1, 0, 0],
  ],
  footL: [
    [0.0, -0.34, 0, 0],
    [0.12, 0.05, 0, 0],
    [0.5, 0.16, 0, 0],
    [0.68, -0.34, 0, 0],
    [1.0, -0.34, 0, 0],
  ],
  upperArmL: [
    [0.0, -0.4, 0, 0.12],
    [0.5, 0.34, 0, 0.16],
    [1.0, -0.4, 0, 0.12],
  ],
  forearmL: [
    [0.0, -0.28, 0, 0],
    [0.5, -0.52, 0, 0],
    [1.0, -0.28, 0, 0],
  ],
};

export const CLIP_WALK = clip('walk', 1.06, true, {
  ...mirrored(WALK_LEFT),
  // Pelvis: two bobs per cycle, plus a roll onto the loaded leg.
  pelvis: [
    [0.0, 0, 0.1, 0.04],
    [0.25, 0, 0, -0.05],
    [0.5, 0, -0.1, -0.04],
    [0.75, 0, 0, 0.05],
    [1.0, 0, 0.1, 0.04],
  ],
  // Chest counter-rotates against the pelvis — the detail that turns a march
  // into a walk.
  chest: [
    [0.0, 0.03, -0.11, 0],
    [0.5, 0.03, 0.11, 0],
    [1.0, 0.03, -0.11, 0],
  ],
  spine: [
    [0.0, 0.04, -0.05, 0],
    [0.5, 0.04, 0.05, 0],
    [1.0, 0.04, -0.05, 0],
  ],
  head: [
    [0.0, 0, 0.05, 0],
    [0.5, 0, -0.05, 0],
    [1.0, 0, 0.05, 0],
  ],
});

const RUN_LEFT: Tracks = {
  thighL: [
    [0.0, 0.95, 0, 0],
    [0.28, 0.25, 0, 0],
    [0.55, -0.62, 0, 0],
    [0.78, 0.1, 0, 0],
    [1.0, 0.95, 0, 0],
  ],
  shinL: [
    [0.0, -0.42, 0, 0],
    [0.2, -0.08, 0, 0],
    [0.5, -0.5, 0, 0],
    [0.66, -1.6, 0, 0],
    [0.85, -1.05, 0, 0],
    [1.0, -0.42, 0, 0],
  ],
  footL: [
    [0.0, -0.15, 0, 0],
    [0.2, 0.1, 0, 0],
    [0.6, 0.34, 0, 0],
    [1.0, -0.15, 0, 0],
  ],
  upperArmL: [
    [0.0, -0.95, 0, 0.2],
    [0.5, 0.55, 0, 0.24],
    [1.0, -0.95, 0, 0.2],
  ],
  forearmL: [
    [0.0, -1.15, 0, 0],
    [0.5, -0.7, 0, 0],
    [1.0, -1.15, 0, 0],
  ],
};

export const CLIP_RUN = clip('run', 0.66, true, {
  ...mirrored(RUN_LEFT),
  pelvis: [
    [0.0, 0, 0.18, 0.06],
    [0.25, 0, 0, -0.08],
    [0.5, 0, -0.18, -0.06],
    [0.75, 0, 0, 0.08],
    [1.0, 0, 0.18, 0.06],
  ],
  // Forward lean: a runner is falling and catching themselves.
  spine: [
    [0.0, 0.2, -0.1, 0],
    [0.5, 0.2, 0.1, 0],
    [1.0, 0.2, -0.1, 0],
  ],
  chest: [
    [0.0, 0.1, -0.2, 0],
    [0.5, 0.1, 0.2, 0],
    [1.0, 0.1, -0.2, 0],
  ],
  head: [
    [0.0, -0.16, 0.06, 0],
    [0.5, -0.16, -0.06, 0],
    [1.0, -0.16, 0.06, 0],
  ],
});

// ---------------------------------------------------------------------------
// Standing
// ---------------------------------------------------------------------------

/** Breathing, a slow weight shift, and just enough drift to look alive. */
export const CLIP_IDLE = clip('idle', 4.6, true, {
  pelvis: [
    [0.0, 0, 0, 0.02],
    [0.35, 0, 0.03, -0.03],
    [0.7, 0, 0, 0.03],
    [1.0, 0, 0, 0.02],
  ],
  spine: [
    [0.0, 0.02, 0, 0],
    [0.5, -0.02, 0, 0],
    [1.0, 0.02, 0, 0],
  ],
  chest: [
    [0.0, -0.03, 0, 0],
    [0.5, 0.03, 0, 0],
    [1.0, -0.03, 0, 0],
  ],
  head: [
    [0.0, 0.02, 0.1, 0],
    [0.3, 0, -0.06, 0],
    [0.62, 0.04, 0.14, 0],
    [1.0, 0.02, 0.1, 0],
  ],
  upperArmL: [
    [0.0, -0.05, 0, 0.16],
    [0.5, -0.02, 0, 0.19],
    [1.0, -0.05, 0, 0.16],
  ],
  upperArmR: [
    [0.0, -0.05, 0, -0.16],
    [0.5, -0.02, 0, -0.19],
    [1.0, -0.05, 0, -0.16],
  ],
  forearmL: [
    [0.0, -0.3, 0, 0],
    [1.0, -0.3, 0, 0],
  ],
  forearmR: [
    [0.0, -0.3, 0, 0],
    [1.0, -0.3, 0, 0],
  ],
});

/** Head sweeping the area — used when a guard is suspicious but has nothing. */
export const CLIP_SCAN = clip('scan', 5.4, true, {
  head: [
    [0.0, 0, 0.62, 0],
    [0.22, 0.06, 0.66, 0],
    [0.45, 0, -0.05, 0],
    [0.68, 0.06, -0.66, 0],
    [0.9, 0, -0.6, 0],
    [1.0, 0, 0.62, 0],
  ],
  chest: [
    [0.0, 0, 0.2, 0],
    [0.45, 0, 0, 0],
    [0.68, 0, -0.2, 0],
    [1.0, 0, 0.2, 0],
  ],
  spine: [
    [0.0, 0.02, 0.08, 0],
    [0.5, 0.02, -0.08, 0],
    [1.0, 0.02, 0.08, 0],
  ],
  upperArmL: [
    [0.0, -0.05, 0, 0.17],
    [1.0, -0.05, 0, 0.17],
  ],
  upperArmR: [
    [0.0, -0.05, 0, -0.17],
    [1.0, -0.05, 0, -0.17],
  ],
  forearmL: [
    [0.0, -0.32, 0, 0],
    [1.0, -0.32, 0, 0],
  ],
  forearmR: [
    [0.0, -0.32, 0, 0],
    [1.0, -0.32, 0, 0],
  ],
});

/**
 * Weapon shouldered. Both hands come onto the rifle and the chest squares up —
 * the pose the aim-offset layer is designed to sit on top of.
 */
export const CLIP_AIM = clip('aim', 3.2, true, {
  upperArmR: [
    [0.0, -1.25, 0.3, -0.42],
    [0.5, -1.22, 0.3, -0.44],
    [1.0, -1.25, 0.3, -0.42],
  ],
  forearmR: [
    [0.0, -1.05, 0, 0.35],
    [1.0, -1.05, 0, 0.35],
  ],
  upperArmL: [
    [0.0, -1.35, -0.5, 0.55],
    [0.5, -1.32, -0.5, 0.57],
    [1.0, -1.35, -0.5, 0.55],
  ],
  forearmL: [
    [0.0, -0.95, 0, -0.5],
    [1.0, -0.95, 0, -0.5],
  ],
  chest: [
    [0.0, 0.04, -0.26, 0],
    [1.0, 0.04, -0.26, 0],
  ],
  spine: [
    [0.0, 0.06, -0.1, 0],
    [1.0, 0.06, -0.1, 0],
  ],
  head: [
    [0.0, 0.02, 0.16, 0],
    [1.0, 0.02, 0.16, 0],
  ],
  // Braced stance: weight back, front leg turned out.
  thighL: [
    [0.0, -0.16, -0.26, 0],
    [1.0, -0.16, -0.26, 0],
  ],
  thighR: [
    [0.0, 0.12, 0.14, 0],
    [1.0, 0.12, 0.14, 0],
  ],
  shinL: [
    [0.0, -0.14, 0, 0],
    [1.0, -0.14, 0, 0],
  ],
  shinR: [
    [0.0, -0.2, 0, 0],
    [1.0, -0.2, 0, 0],
  ],
  pelvis: [
    [0.0, 0, -0.2, 0],
    [1.0, 0, -0.2, 0],
  ],
});

/** Advancing with the weapon up: a shortened walk that keeps the aim pose. */
export const CLIP_COMBAT_WALK = clip('combat-walk', 0.86, true, {
  ...mirrored({
    thighL: [
      [0.0, 0.3, -0.2, 0],
      [0.5, -0.26, -0.2, 0],
      [1.0, 0.3, -0.2, 0],
    ],
    shinL: [
      [0.0, -0.1, 0, 0],
      [0.55, -0.62, 0, 0],
      [1.0, -0.1, 0, 0],
    ],
    footL: [
      [0.0, -0.2, 0, 0],
      [0.5, 0.1, 0, 0],
      [1.0, -0.2, 0, 0],
    ],
  }),
  upperArmR: [
    [0.0, -1.25, 0.3, -0.42],
    [1.0, -1.25, 0.3, -0.42],
  ],
  forearmR: [
    [0.0, -1.05, 0, 0.35],
    [1.0, -1.05, 0, 0.35],
  ],
  upperArmL: [
    [0.0, -1.35, -0.5, 0.55],
    [1.0, -1.35, -0.5, 0.55],
  ],
  forearmL: [
    [0.0, -0.95, 0, -0.5],
    [1.0, -0.95, 0, -0.5],
  ],
  chest: [
    [0.0, 0.04, -0.3, 0],
    [0.5, 0.04, -0.22, 0],
    [1.0, 0.04, -0.3, 0],
  ],
  pelvis: [
    [0.0, 0, -0.18, 0.04],
    [0.5, 0, -0.22, -0.04],
    [1.0, 0, -0.18, 0.04],
  ],
});

export const CLIP_CROUCH = clip('crouch', 4.0, true, {
  pelvis: [
    [0.0, 0.16, -0.16, 0],
    [0.5, 0.18, -0.16, 0],
    [1.0, 0.16, -0.16, 0],
  ],
  thighL: [
    [0.0, -1.15, -0.2, 0],
    [1.0, -1.15, -0.2, 0],
  ],
  thighR: [
    [0.0, -1.3, 0.16, 0],
    [1.0, -1.3, 0.16, 0],
  ],
  shinL: [
    [0.0, 1.5, 0, 0],
    [1.0, 1.5, 0, 0],
  ],
  shinR: [
    [0.0, 1.7, 0, 0],
    [1.0, 1.7, 0, 0],
  ],
  footL: [
    [0.0, -0.3, 0, 0],
    [1.0, -0.3, 0, 0],
  ],
  footR: [
    [0.0, -0.4, 0, 0],
    [1.0, -0.4, 0, 0],
  ],
  spine: [
    [0.0, 0.24, -0.08, 0],
    [1.0, 0.24, -0.08, 0],
  ],
  chest: [
    [0.0, 0.1, -0.22, 0],
    [1.0, 0.1, -0.22, 0],
  ],
  upperArmR: [
    [0.0, -1.2, 0.3, -0.4],
    [1.0, -1.2, 0.3, -0.4],
  ],
  forearmR: [
    [0.0, -1.0, 0, 0.34],
    [1.0, -1.0, 0, 0.34],
  ],
  upperArmL: [
    [0.0, -1.3, -0.5, 0.52],
    [1.0, -1.3, -0.5, 0.52],
  ],
  forearmL: [
    [0.0, -0.92, 0, -0.48],
    [1.0, -0.92, 0, -0.48],
  ],
});

// ---------------------------------------------------------------------------
// One-shots and additive layers
// ---------------------------------------------------------------------------

/** Magazine out, magazine in, bolt released. Played once. */
export const CLIP_RELOAD = clip('reload', 2.0, false, {
  upperArmL: [
    [0.0, -1.35, -0.5, 0.55],
    [0.18, -0.35, -0.7, 0.3],
    [0.36, -0.2, -0.9, 0.2],
    [0.58, -0.5, -0.6, 0.35],
    [0.78, -1.3, -0.5, 0.55],
    [1.0, -1.35, -0.5, 0.55],
  ],
  forearmL: [
    [0.0, -0.95, 0, -0.5],
    [0.2, -1.7, 0, -0.3],
    [0.4, -1.9, 0, -0.2],
    [0.62, -1.4, 0, -0.4],
    [1.0, -0.95, 0, -0.5],
  ],
  upperArmR: [
    [0.0, -1.25, 0.3, -0.42],
    [0.4, -0.95, 0.3, -0.5],
    [1.0, -1.25, 0.3, -0.42],
  ],
  head: [
    [0.0, 0.02, 0.16, 0],
    [0.3, 0.26, 0.05, 0],
    [0.7, 0.2, 0.08, 0],
    [1.0, 0.02, 0.16, 0],
  ],
  chest: [
    [0.0, 0.04, -0.26, 0],
    [0.35, 0.14, -0.14, 0],
    [1.0, 0.04, -0.26, 0],
  ],
});

/**
 * Additive: the shove of a shot going off. Layered on top of whatever the
 * character is already doing, so firing while walking doesn't reset the gait.
 */
export const CLIP_FIRE_ADD = clip('fire', 0.24, false, {
  chest: [
    [0.0, 0, 0, 0],
    [0.12, -0.13, 0.05, 0],
    [1.0, 0, 0, 0],
  ],
  upperArmR: [
    [0.0, 0, 0, 0],
    [0.1, 0.22, 0, 0],
    [1.0, 0, 0, 0],
  ],
  upperArmL: [
    [0.0, 0, 0, 0],
    [0.1, 0.16, 0, 0],
    [1.0, 0, 0, 0],
  ],
  head: [
    [0.0, 0, 0, 0],
    [0.14, -0.09, 0, 0],
    [1.0, 0, 0, 0],
  ],
});

/** Additive: taking a round. Whips the torso and snaps the head back. */
export const CLIP_HIT_ADD = clip('hit', 0.42, false, {
  chest: [
    [0.0, 0, 0, 0],
    [0.16, -0.34, 0.16, 0.12],
    [0.55, 0.08, -0.04, 0],
    [1.0, 0, 0, 0],
  ],
  spine: [
    [0.0, 0, 0, 0],
    [0.18, -0.2, 0.1, 0],
    [1.0, 0, 0, 0],
  ],
  head: [
    [0.0, 0, 0, 0],
    [0.12, -0.42, 0.2, 0],
    [0.5, 0.12, 0, 0],
    [1.0, 0, 0, 0],
  ],
  upperArmR: [
    [0.0, 0, 0, 0],
    [0.2, 0.3, 0, -0.2],
    [1.0, 0, 0, 0],
  ],
});

/** A collapse, not a topple: knees give first, then the torso folds. */
export const CLIP_DEATH = clip('death', 1.15, false, {
  pelvis: [
    [0.0, 0, 0, 0],
    [0.3, 0.3, 0.1, 0.1],
    [1.0, 0.62, 0.16, 0.2],
  ],
  spine: [
    [0.0, 0, 0, 0],
    [0.25, -0.3, 0, 0],
    [1.0, 0.5, 0.1, 0.15],
  ],
  chest: [
    [0.0, 0, 0, 0],
    [0.2, -0.35, 0.2, 0],
    [1.0, 0.45, 0.25, 0.2],
  ],
  head: [
    [0.0, 0, 0, 0],
    [0.18, -0.5, 0.3, 0],
    [1.0, 0.55, 0.2, 0.3],
  ],
  thighL: [
    [0.0, 0, 0, 0],
    [0.35, -1.0, -0.15, 0],
    [1.0, -1.5, -0.3, 0],
  ],
  thighR: [
    [0.0, 0, 0, 0],
    [0.35, -0.8, 0.2, 0],
    [1.0, -1.2, 0.35, 0],
  ],
  shinL: [
    [0.0, 0, 0, 0],
    [0.4, 1.3, 0, 0],
    [1.0, 1.9, 0, 0],
  ],
  shinR: [
    [0.0, 0, 0, 0],
    [0.4, 1.1, 0, 0],
    [1.0, 1.7, 0, 0],
  ],
  upperArmL: [
    [0.0, 0, 0, 0],
    [0.3, -0.4, 0, 0.9],
    [1.0, 0.5, 0, 1.2],
  ],
  upperArmR: [
    [0.0, 0, 0, 0],
    [0.3, -0.5, 0, -0.8],
    [1.0, 0.6, 0, -1.1],
  ],
  forearmL: [
    [0.0, 0, 0, 0],
    [1.0, -0.7, 0, 0],
  ],
  forearmR: [
    [0.0, 0, 0, 0],
    [1.0, -0.9, 0, 0],
  ],
});

export const CLIPS = {
  idle: CLIP_IDLE,
  scan: CLIP_SCAN,
  walk: CLIP_WALK,
  run: CLIP_RUN,
  aim: CLIP_AIM,
  combatWalk: CLIP_COMBAT_WALK,
  crouch: CLIP_CROUCH,
  reload: CLIP_RELOAD,
  death: CLIP_DEATH,
} as const;

export type ClipName = keyof typeof CLIPS;
