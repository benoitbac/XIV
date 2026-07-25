import {
  Box3,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshToonMaterial,
  Object3D,
  PointLight,
  Vector3,
} from 'three';
import { BrushWorld, type Surface } from './Collision.ts';
import { PALETTE } from '../render/palette.ts';
import { toon, type RampName } from '../render/toon.ts';
import { scaleBoxUVs, type SurfaceTexture } from '../render/textures.ts';
import { mulberry32 } from '../core/mathx.ts';
import type { WeaponId } from '../player/weapons.ts';
import type { SkySettings } from '../render/Stage.ts';

/**
 * Every surface kind gets a sensible texture and ramp by default, so a level
 * author writes `'wood'` and gets boards, not a flat brown rectangle.
 */
const DEFAULT_TEXTURE: Record<Surface, SurfaceTexture | null> = {
  snow: 'snow',
  wood: 'plank',
  metal: 'metal',
  concrete: 'concrete',
  glass: null,
  flesh: null,
};

const DEFAULT_RAMP: Record<Surface, RampName> = {
  snow: 'snow',
  wood: 'duo',
  metal: 'duo',
  concrete: 'duo',
  glass: 'flat',
  flesh: 'trio',
};

export type PickupKind =
  | { type: 'weapon'; weapon: WeaponId; magazines?: number }
  | { type: 'ammo'; weapon: WeaponId; rounds: number }
  | { type: 'health'; amount: number }
  | { type: 'armour'; amount: number }
  | { type: 'document'; id: string }
  | { type: 'memory'; id: string };

export interface Pickup {
  kind: PickupKind;
  position: Vector3;
  object: Object3D;
  radius: number;
  /** Documents and memories need a deliberate [E]; ammo is walked over. */
  requiresUse: boolean;
  label: string;
  taken: boolean;
}

export interface Trigger {
  id: string;
  box: Box3;
  once: boolean;
  fired: boolean;
}

export interface Interactable {
  id: string;
  position: Vector3;
  radius: number;
  label: string;
  enabled: boolean;
  used: boolean;
  once: boolean;
}

export interface EnemySpawn {
  archetype: string;
  position: Vector3;
  yaw: number;
  patrol: Vector3[];
  /** Groups alert each other when one of them spots the player. */
  squad?: string;
}

export interface LevelDefinition {
  id: string;
  title: string;
  subtitle: string;
  sky: Partial<SkySettings>;
  windIntensity: number;
  spawn: { position: Vector3; yaw: number };
  build(builder: LevelBuilder): void;
}

export interface SlopeStep {
  /** World Z of the step's centre. */
  z: number;
  /** Height of the step's walking surface. */
  top: number;
  depth: number;
}

/**
 * Treads of a stepped slope, from the -Z end to the +Z end.
 *
 * Pulled out as a pure function because getting the two end heights the wrong
 * way round silently builds a cliff where a ramp should be — it looks fine from
 * every angle and only shows up when someone tries to walk down it.
 */
export function slopeSteps(
  z: number,
  depth: number,
  yAtMinZ: number,
  yAtMaxZ: number,
  steps: number,
): SlopeStep[] {
  const stepDepth = depth / steps;
  const out: SlopeStep[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / steps;
    out.push({
      z: z - depth / 2 + stepDepth * (i + 0.5),
      top: yAtMinZ + (yAtMaxZ - yAtMinZ) * t,
      depth: stepDepth + 0.02,
    });
  }
  return out;
}

/**
 * Levels are built from axis-aligned boxes: it keeps collision exact, it batches
 * well, and it happens to be exactly the vocabulary the ink pass flatters —
 * strong silhouettes, hard creases.
 */
export class LevelBuilder {
  readonly root = new Group();
  readonly world = new BrushWorld();
  readonly pickups: Pickup[] = [];
  readonly triggers: Trigger[] = [];
  readonly interactables: Interactable[] = [];
  readonly enemies: EnemySpawn[] = [];
  readonly lights: PointLight[] = [];
  readonly random: () => number;

  constructor(seed = 1414) {
    this.root.name = 'level';
    this.random = mulberry32(seed);
  }

  /**
   * Adds a solid box. `x/y/z` is the centre of the footprint at its base, so
   * levels are laid out from the floor up rather than from box centres.
   */
  box(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    surface: Surface,
    hex: number,
    options: {
      ramp?: RampName;
      texture?: SurfaceTexture;
      /** World metres covered by one texture tile. */
      tile?: number;
      collide?: boolean;
      visible?: boolean;
      castShadow?: boolean;
      receiveShadow?: boolean;
    } = {},
  ): Mesh {
    const texture = options.texture ?? DEFAULT_TEXTURE[surface];
    const material = toon(hex, {
      ramp: options.ramp ?? DEFAULT_RAMP[surface],
      ...(texture ? { texture } : {}),
    });

    const geometry = new BoxGeometry(width, height, depth);
    if (texture) scaleBoxUVs(geometry, width, height, depth, options.tile ?? 2.2);

    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y + height / 2, z);
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    if (options.visible !== false) this.root.add(mesh);

    if (options.collide !== false) {
      this.world.add(
        new Box3(
          new Vector3(x - width / 2, y, z - depth / 2),
          new Vector3(x + width / 2, y + height, z + depth / 2),
        ),
        surface,
      );
    }
    return mesh;
  }

  /** Collision-only volume: invisible walls that keep the player on the map. */
  clip(x: number, y: number, z: number, width: number, height: number, depth: number): void {
    this.world.add(
      new Box3(
        new Vector3(x - width / 2, y, z - depth / 2),
        new Vector3(x + width / 2, y + height, z + depth / 2),
      ),
      'concrete',
    );
  }

  /** Decoration with no collision — safe to scatter in bulk. */
  decor(mesh: Mesh, x: number, y: number, z: number): Mesh {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /** Adds a pre-built prop group from the kit, with shadows wired up. */
  prop(
    object: Object3D,
    x: number,
    y: number,
    z: number,
    yaw = 0,
    options: { shadows?: boolean } = {},
  ): Object3D {
    object.position.set(x, y, z);
    object.rotation.y = yaw;
    const shadows = options.shadows ?? true;
    object.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = shadows;
        o.receiveShadow = shadows;
      }
    });
    this.root.add(object);
    return object;
  }

  /**
   * A practical light. The key light is a single low sun, so anything with a
   * roof over it is pitch black without one of these — and cranking ambient to
   * compensate would flatten the toon ramp everywhere outdoors.
   *
   * Deliberately shadowless: point-light shadow cubes cost six render passes
   * each, and the ink pass already gives interiors their structure.
   */
  lamp(
    x: number,
    y: number,
    z: number,
    options: { colour?: number; intensity?: number; distance?: number } = {},
  ): PointLight {
    const light = new PointLight(
      options.colour ?? 0xffd9a0,
      options.intensity ?? 9,
      options.distance ?? 9,
      1.6,
    );
    light.position.set(x, y, z);
    light.castShadow = false;
    this.root.add(light);
    this.lights.push(light);
    return light;
  }

  /**
   * A stepped slope, built from boxes. Real ramps would need a triangle
   * collider; a staircase of boxes reads identically once inked and the
   * character controller steps up it for free.
   *
   * The heights are named for the ends they belong to — getting these the wrong
   * way round builds a cliff where a ramp should be, and it is invisible until
   * someone tries to walk down it.
   */
  slope(
    x: number,
    z: number,
    width: number,
    depth: number,
    yAtMinZ: number,
    yAtMaxZ: number,
    steps: number,
    surface: Surface,
    hex: number,
  ): void {
    const floor = Math.min(yAtMinZ, yAtMaxZ);
    for (const step of slopeSteps(z, depth, yAtMinZ, yAtMaxZ, steps)) {
      // Each step is dropped well below the pair it joins, so the slope is a
      // solid wedge rather than a set of floating treads with sky underneath.
      this.box(x, floor - 4, step.z, width, step.top - floor + 4, step.depth, surface, hex);
    }
  }

  pine(x: number, z: number, groundY: number, scale = 1): void {
    const trunk = new Mesh(
      new CylinderGeometry(0.16 * scale, 0.22 * scale, 2.2 * scale, 6),
      toon(PALETTE.woodDark, { ramp: 'duo' }),
    );
    trunk.position.set(x, groundY + 1.1 * scale, z);
    this.root.add(trunk);

    const foliage = toon(0x2f4a38, { ramp: 'trio' });
    for (let i = 0; i < 3; i++) {
      const r = (1.5 - i * 0.38) * scale;
      const cone = new Mesh(new ConeGeometry(r, 2 * scale, 7), foliage);
      cone.position.set(x, groundY + (2.1 + i * 1.15) * scale, z);
      cone.rotation.y = this.random() * Math.PI;
      this.root.add(cone);
    }
    // The trunk blocks movement; the canopy does not, so you can walk under it.
    this.world.add(
      new Box3(
        new Vector3(x - 0.3 * scale, groundY, z - 0.3 * scale),
        new Vector3(x + 0.3 * scale, groundY + 2.2 * scale, z + 0.3 * scale),
      ),
      'wood',
    );
  }

  rock(x: number, z: number, groundY: number, size = 1): void {
    const mesh = new Mesh(
      new BoxGeometry(size * 1.6, size * 1.1, size * 1.4),
      toon(0x6f7681, { ramp: 'trio' }),
    );
    mesh.position.set(x, groundY + size * 0.55, z);
    mesh.rotation.set(this.random() * 0.3, this.random() * Math.PI, this.random() * 0.3);
    this.root.add(mesh);
    this.world.add(
      new Box3(
        new Vector3(x - size * 0.7, groundY, z - size * 0.6),
        new Vector3(x + size * 0.7, groundY + size * 1.0, z + size * 0.6),
      ),
      'concrete',
    );
  }

  pickup(
    kind: PickupKind,
    position: Vector3,
    label: string,
    options: { requiresUse?: boolean; radius?: number } = {},
  ): Pickup {
    const object = buildPickupMesh(kind);
    object.position.copy(position);
    this.root.add(object);

    const pickup: Pickup = {
      kind,
      position: position.clone(),
      object,
      radius: options.radius ?? 1.1,
      requiresUse: options.requiresUse ?? (kind.type === 'document' || kind.type === 'memory'),
      label,
      taken: false,
    };
    this.pickups.push(pickup);
    return pickup;
  }

  trigger(id: string, centre: Vector3, size: Vector3, once = true): Trigger {
    const t: Trigger = {
      id,
      box: new Box3(
        centre.clone().sub(size.clone().multiplyScalar(0.5)),
        centre.clone().add(size.clone().multiplyScalar(0.5)),
      ),
      once,
      fired: false,
    };
    this.triggers.push(t);
    return t;
  }

  interactable(
    id: string,
    position: Vector3,
    label: string,
    options: { radius?: number; enabled?: boolean; once?: boolean } = {},
  ): Interactable {
    const i: Interactable = {
      id,
      position: position.clone(),
      radius: options.radius ?? 2,
      label,
      enabled: options.enabled ?? true,
      used: false,
      once: options.once ?? true,
    };
    this.interactables.push(i);
    return i;
  }

  enemy(
    archetype: string,
    position: Vector3,
    yaw: number,
    patrol: Vector3[] = [],
    squad?: string,
  ): void {
    const spawn: EnemySpawn = { archetype, position, yaw, patrol };
    if (squad !== undefined) spawn.squad = squad;
    this.enemies.push(spawn);
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.root.clear();
    this.world.clear();
  }
}

const pickupMaterials: Record<string, MeshToonMaterial> = {};

function pickupMaterial(hex: number): MeshToonMaterial {
  return (pickupMaterials[hex] ??= toon(hex, { ramp: 'trio' }));
}

function buildPickupMesh(kind: PickupKind): Group {
  const g = new Group();
  g.name = `pickup:${kind.type}`;

  switch (kind.type) {
    case 'weapon': {
      const body = new Mesh(new BoxGeometry(0.42, 0.1, 0.12), pickupMaterial(PALETTE.steelDark));
      const grip = new Mesh(new BoxGeometry(0.1, 0.2, 0.1), pickupMaterial(PALETTE.woodDark));
      grip.position.set(0.12, -0.14, 0);
      g.add(body, grip);
      break;
    }
    case 'ammo': {
      const crate = new Mesh(new BoxGeometry(0.34, 0.2, 0.22), pickupMaterial(0x4d5a3c));
      const band = new Mesh(new BoxGeometry(0.36, 0.05, 0.24), pickupMaterial(PALETTE.ink));
      band.position.y = 0.06;
      g.add(crate, band);
      break;
    }
    case 'health': {
      const kit = new Mesh(new BoxGeometry(0.3, 0.2, 0.22), pickupMaterial(PALETTE.paper));
      const cross1 = new Mesh(new BoxGeometry(0.18, 0.05, 0.02), pickupMaterial(PALETTE.blood));
      cross1.position.z = 0.12;
      const cross2 = new Mesh(new BoxGeometry(0.05, 0.14, 0.02), pickupMaterial(PALETTE.blood));
      cross2.position.z = 0.12;
      g.add(kit, cross1, cross2);
      break;
    }
    case 'armour': {
      const vest = new Mesh(new BoxGeometry(0.34, 0.4, 0.16), pickupMaterial(0x3c4550));
      g.add(vest);
      break;
    }
    case 'document': {
      const folder = new Mesh(new BoxGeometry(0.3, 0.02, 0.4), pickupMaterial(0xd8c9a3));
      folder.rotation.z = 0.08;
      const stamp = new Mesh(new BoxGeometry(0.12, 0.03, 0.05), pickupMaterial(PALETTE.blood));
      stamp.position.set(0.06, 0.02, -0.12);
      g.add(folder, stamp);
      break;
    }
    case 'memory': {
      // A glinting shard — the game's shorthand for "something surfaces here".
      const shard = new Mesh(new ConeGeometry(0.12, 0.34, 4), pickupMaterial(PALETTE.ally));
      g.add(shard);
      break;
    }
  }
  return g;
}
