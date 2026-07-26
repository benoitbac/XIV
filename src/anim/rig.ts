import { Box3, Group, Matrix4, Mesh, Object3D, Vector3 } from 'three';

/**
 * A humanoid joint hierarchy.
 *
 * The characters are built from boxes, so there is no skinning: each body part
 * is simply parented to a joint and inherits its transform. That is all a
 * blocky figure needs, and it buys the thing that actually matters — a real
 * chain, so rotating the chest carries the arms, the head and the weapon with
 * it, and an aim offset can be layered on top of a walk without fighting it.
 */

export type JointName =
  | 'root'
  | 'pelvis'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'clavicleL'
  | 'upperArmL'
  | 'forearmL'
  | 'handL'
  | 'clavicleR'
  | 'upperArmR'
  | 'forearmR'
  | 'handR'
  | 'thighL'
  | 'shinL'
  | 'footL'
  | 'thighR'
  | 'shinR'
  | 'footR';

interface JointDef {
  name: JointName;
  parent: JointName | null;
  /** Offset from the parent joint, in metres, in bind pose. */
  offset: readonly [number, number, number];
}

/**
 * Proportions matter more than polygon count. These are drawn from a roughly
 * 1.80 m figure with the head deliberately a little small and the shoulders a
 * little wide — the silhouette cue that reads as an adult in a heavy coat
 * rather than as a toy.
 */
const SKELETON: readonly JointDef[] = [
  { name: 'root', parent: null, offset: [0, 0, 0] },
  { name: 'pelvis', parent: 'root', offset: [0, 0.94, 0] },
  { name: 'spine', parent: 'pelvis', offset: [0, 0.16, 0] },
  { name: 'chest', parent: 'spine', offset: [0, 0.22, 0] },
  { name: 'neck', parent: 'chest', offset: [0, 0.2, 0] },
  { name: 'head', parent: 'neck', offset: [0, 0.1, 0] },

  { name: 'clavicleL', parent: 'chest', offset: [-0.1, 0.14, 0] },
  { name: 'upperArmL', parent: 'clavicleL', offset: [-0.16, 0, 0] },
  { name: 'forearmL', parent: 'upperArmL', offset: [0, -0.28, 0] },
  { name: 'handL', parent: 'forearmL', offset: [0, -0.26, 0] },

  { name: 'clavicleR', parent: 'chest', offset: [0.1, 0.14, 0] },
  { name: 'upperArmR', parent: 'clavicleR', offset: [0.16, 0, 0] },
  { name: 'forearmR', parent: 'upperArmR', offset: [0, -0.28, 0] },
  { name: 'handR', parent: 'forearmR', offset: [0, -0.26, 0] },

  { name: 'thighL', parent: 'pelvis', offset: [-0.11, -0.04, 0] },
  { name: 'shinL', parent: 'thighL', offset: [0, -0.44, 0] },
  { name: 'footL', parent: 'shinL', offset: [0, -0.42, 0] },

  { name: 'thighR', parent: 'pelvis', offset: [0.11, -0.04, 0] },
  { name: 'shinR', parent: 'thighR', offset: [0, -0.44, 0] },
  { name: 'footR', parent: 'shinR', offset: [0, -0.42, 0] },
];

export const JOINT_NAMES: readonly JointName[] = SKELETON.map((j) => j.name);

/** Mirrors a joint name across the body, for authoring one side of a walk cycle. */
export function mirrorJoint(name: JointName): JointName {
  if (name.endsWith('L')) return (name.slice(0, -1) + 'R') as JointName;
  if (name.endsWith('R')) return (name.slice(0, -1) + 'L') as JointName;
  return name;
}

export class Rig {
  readonly root = new Group();
  readonly joints = new Map<JointName, Object3D>();
  /** Bind-pose local position of every joint, so clips can offset from it. */
  readonly bindPositions = new Map<JointName, Vector3>();
  /** Parts registered for hit detection, with their local half-extents. */
  readonly parts: Array<{ mesh: Mesh; half: Vector3 }> = [];

  constructor() {
    for (const def of SKELETON) {
      const joint = new Object3D();
      joint.name = def.name;
      joint.position.set(def.offset[0], def.offset[1], def.offset[2]);
      this.bindPositions.set(def.name, joint.position.clone());
      this.joints.set(def.name, joint);

      const parent = def.parent ? this.joints.get(def.parent) : null;
      (parent ?? this.root).add(joint);
    }
  }

  joint(name: JointName): Object3D {
    const j = this.joints.get(name);
    if (!j) throw new Error(`XIV: unknown joint "${name}"`);
    return j;
  }

  /**
   * Attaches a mesh to a joint. `offset` is in the joint's local space, so a
   * thigh box hangs downward from the hip rather than being centred on it.
   */
  attach(
    name: JointName,
    mesh: Mesh,
    offset: readonly [number, number, number] = [0, 0, 0],
    options: { hitbox?: boolean } = {},
  ): Mesh {
    mesh.position.set(offset[0], offset[1], offset[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.joint(name).add(mesh);

    if (options.hitbox !== false) {
      const params = mesh.geometry.boundingBox ?? null;
      if (!params) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox as Box3;
      this.parts.push({
        mesh,
        half: new Vector3(
          (box.max.x - box.min.x) / 2,
          (box.max.y - box.min.y) / 2,
          (box.max.z - box.min.z) / 2,
        ),
      });
    }
    return mesh;
  }

  /** Resets every joint to its bind pose, ready for a fresh pose to be applied. */
  resetPose(): void {
    for (const [name, joint] of this.joints) {
      joint.rotation.set(0, 0, 0);
      const bind = this.bindPositions.get(name);
      if (bind) joint.position.copy(bind);
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.joints.clear();
    this.parts.length = 0;
  }
}

const _matrix = new Matrix4();

/**
 * Conservative world-space AABB for an animated part, taken from its world
 * matrix rather than its vertices.
 *
 * `Box3.setFromObject` walks the geometry every call, which is far too much
 * work to do per limb per enemy per frame. Summing the absolute values of each
 * matrix row gives the tightest axis-aligned box that is guaranteed to contain
 * the rotated part, for the cost of nine multiplies.
 */
export function worldBoxFromPart(mesh: Mesh, half: Vector3, out: Box3): Box3 {
  mesh.updateWorldMatrix(true, false);
  _matrix.copy(mesh.matrixWorld);
  const e = _matrix.elements;

  const cx = e[12]!;
  const cy = e[13]!;
  const cz = e[14]!;

  const hx = Math.abs(e[0]!) * half.x + Math.abs(e[4]!) * half.y + Math.abs(e[8]!) * half.z;
  const hy = Math.abs(e[1]!) * half.x + Math.abs(e[5]!) * half.y + Math.abs(e[9]!) * half.z;
  const hz = Math.abs(e[2]!) * half.x + Math.abs(e[6]!) * half.y + Math.abs(e[10]!) * half.z;

  out.min.set(cx - hx, cy - hy, cz - hz);
  out.max.set(cx + hx, cy + hy, cz + hz);
  return out;
}
