import { Box3, BoxGeometry, Group, Mesh, MeshToonMaterial, Vector3 } from 'three';
import { Signal } from '../core/signal.ts';
import { angleDelta, clamp, damp, randRange } from '../core/mathx.ts';
import { moveBody, type BrushWorld, type Surface } from '../world/Collision.ts';
import { PALETTE } from '../render/palette.ts';
import { toon } from '../render/toon.ts';

export type EnemyState = 'idle' | 'patrol' | 'suspicious' | 'combat' | 'search' | 'dead';

export type BodyPart = 'head' | 'torso' | 'limb';

export interface EnemyArchetype {
  id: string;
  name: string;
  health: number;
  /** Metres per second while patrolling / while fighting. */
  patrolSpeed: number;
  combatSpeed: number;
  /** Damage per shot at the player. */
  damage: number;
  /** Rounds per burst and the gap between bursts. */
  burst: number;
  burstGap: number;
  shotGap: number;
  /** Radians of aim error; the difficulty scales this. */
  accuracy: number;
  visionRange: number;
  visionFov: number;
  /** Seconds of continuous sighting before they open fire. */
  reactionTime: number;
  hearingRange: number;
  jacket: number;
  trousers: number;
  /** Bright collar colour so archetypes read apart at a glance. */
  accent: number;
  helmet: boolean;
}

export const ARCHETYPES: Record<string, EnemyArchetype> = {
  ranger: {
    id: 'ranger',
    name: 'Garde forestier',
    health: 70,
    patrolSpeed: 1.7,
    combatSpeed: 3.4,
    damage: 9,
    burst: 2,
    burstGap: 1.5,
    shotGap: 0.32,
    accuracy: 0.075,
    visionRange: 34,
    visionFov: 1.75,
    reactionTime: 0.55,
    hearingRange: 22,
    jacket: PALETTE.wood,
    trousers: PALETTE.steelDark,
    accent: 0xb98a3c,
    helmet: false,
  },
  trooper: {
    id: 'trooper',
    name: 'Milicien du Conclave',
    health: 95,
    patrolSpeed: 2,
    combatSpeed: 4.1,
    damage: 11,
    burst: 4,
    burstGap: 1.15,
    shotGap: 0.11,
    accuracy: 0.055,
    visionRange: 40,
    visionFov: 1.9,
    reactionTime: 0.38,
    hearingRange: 28,
    jacket: PALETTE.steelDark,
    trousers: 0x2a3038,
    accent: PALETTE.hostile,
    helmet: true,
  },
  sentinel: {
    id: 'sentinel',
    name: 'Sentinelle',
    health: 150,
    patrolSpeed: 1.5,
    combatSpeed: 3,
    damage: 16,
    burst: 6,
    burstGap: 1.6,
    shotGap: 0.09,
    accuracy: 0.04,
    visionRange: 46,
    visionFov: 2.05,
    reactionTime: 0.3,
    hearingRange: 32,
    jacket: 0x1f242b,
    trousers: 0x161a1f,
    accent: PALETTE.alert,
    helmet: true,
  },
};

export interface EnemyHit {
  part: BodyPart;
  point: Vector3;
  distance: number;
}

export interface EnemyShot {
  origin: Vector3;
  direction: Vector3;
  damage: number;
  enemy: Enemy;
}

const PART_MULTIPLIER: Record<BodyPart, number> = { head: 3.2, torso: 1, limb: 0.62 };

const RADIUS = 0.36;
const HEIGHT = 1.78;

interface Part {
  mesh: Mesh;
  kind: BodyPart;
  /** Half-extents, local. */
  half: Vector3;
  /** Offset from the enemy's feet, before yaw rotation. */
  offset: Vector3;
  worldBox: Box3;
}

/**
 * A guard. Blocky on purpose — the ink pass does the detailing, so the mesh
 * only has to carry a readable silhouette and a walk cycle.
 */
export class Enemy {
  readonly group = new Group();
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly archetype: EnemyArchetype;

  readonly onShoot = new Signal<EnemyShot>();
  readonly onKilled = new Signal<{ enemy: Enemy; part: BodyPart }>();
  readonly onAlerted = new Signal<Enemy>();
  readonly onFootstep = new Signal<{ surface: Surface; position: Vector3 }>();

  state: EnemyState = 'patrol';
  health: number;
  yaw = 0;
  alive = true;
  /** Filled by the level; the guard walks the loop while unaware. */
  patrol: Vector3[] = [];

  /** Scales incoming damage and their aim; set from difficulty. */
  aimError = 1;

  #patrolIndex = 0;
  #waitTimer = 0;
  #sightTimer = 0;
  #lostTimer = 0;
  #searchTimer = 0;
  #shotTimer = 0;
  #burstLeft = 0;
  #strafe = 1;
  #strafeTimer = 0;
  #stepAccumulator = 0;
  #walkPhase = 0;
  #deathTimer = 0;
  #hitFlash = 0;
  #groundSurface: Surface | null = null;
  #lastKnown = new Vector3();
  #hasLastKnown = false;

  readonly #parts: Part[] = [];
  readonly #world: BrushWorld;
  readonly #materials: MeshToonMaterial[] = [];

  constructor(world: BrushWorld, archetype: EnemyArchetype) {
    this.#world = world;
    this.archetype = archetype;
    this.health = archetype.health;
    this.#build();
  }

  #addPart(
    kind: BodyPart,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: MeshToonMaterial,
    name?: string,
  ): Part {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    if (name) mesh.name = name;
    this.group.add(mesh);
    const part: Part = {
      mesh,
      kind,
      half: new Vector3(w / 2, h / 2, d / 2),
      offset: new Vector3(x, y, z),
      worldBox: new Box3(),
    };
    this.#parts.push(part);
    return part;
  }

  #build(): void {
    const a = this.archetype;
    const jacket = toon(a.jacket, { ramp: 'trio' });
    const trousers = toon(a.trousers, { ramp: 'trio' });
    const skin = toon(0xd9a877, { ramp: 'trio' });
    const accent = toon(a.accent, { ramp: 'trio' });
    const gunMat = toon(PALETTE.steelDark, { ramp: 'trio' });
    this.#materials.push(jacket, trousers, skin, accent, gunMat);

    this.#addPart('torso', 0.5, 0.62, 0.29, 0, 1.02, 0, jacket);
    this.#addPart('torso', 0.52, 0.14, 0.31, 0, 1.36, 0, accent); // collar
    this.#addPart('head', 0.25, 0.27, 0.25, 0, 1.58, 0, a.helmet ? jacket : skin, 'head');
    if (a.helmet) {
      this.#addPart('head', 0.29, 0.1, 0.29, 0, 1.7, 0, trousers);
    }
    // Arms hold the weapon out front, which is what sells "he's aiming at me".
    this.#addPart('limb', 0.14, 0.44, 0.16, -0.31, 1.06, -0.06, jacket, 'armL');
    this.#addPart('limb', 0.14, 0.44, 0.16, 0.31, 1.06, -0.06, jacket, 'armR');
    this.#addPart('limb', 0.19, 0.72, 0.2, -0.13, 0.36, 0, trousers, 'legL');
    this.#addPart('limb', 0.19, 0.72, 0.2, 0.13, 0.36, 0, trousers, 'legR');

    const rifle = new Mesh(new BoxGeometry(0.07, 0.09, 0.62), gunMat);
    rifle.position.set(0.27, 1.06, -0.34);
    rifle.name = 'rifle';
    this.group.add(rifle);

    this.group.userData.enemy = this;
  }

  spawn(position: Vector3, yaw: number): void {
    this.position.copy(position);
    this.yaw = yaw;
    this.group.position.copy(position);
    this.group.rotation.y = yaw;
    this.alive = true;
    this.state = this.patrol.length > 1 ? 'patrol' : 'idle';
    this.health = this.archetype.health;
  }

  get eyePosition(): Vector3 {
    return _eye.set(this.position.x, this.position.y + 1.58, this.position.z);
  }

  get aware(): boolean {
    return this.state === 'combat' || this.state === 'search';
  }

  #refreshBoxes(): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    for (const p of this.#parts) {
      // Rotate the local offset into world space (yaw only — bodies stay upright).
      const ox = p.offset.x * cos + p.offset.z * sin;
      const oz = -p.offset.x * sin + p.offset.z * cos;
      // Yaw-rotated half extents, expanded conservatively so a turned guard is
      // never harder to hit than a facing one.
      const hx = Math.abs(p.half.x * cos) + Math.abs(p.half.z * sin);
      const hz = Math.abs(p.half.x * sin) + Math.abs(p.half.z * cos);
      p.worldBox.min.set(
        this.position.x + ox - hx,
        this.position.y + p.offset.y - p.half.y,
        this.position.z + oz - hz,
      );
      p.worldBox.max.set(
        this.position.x + ox + hx,
        this.position.y + p.offset.y + p.half.y,
        this.position.z + oz + hz,
      );
    }
  }

  /** Ray/part intersection used by every bullet. Returns the nearest part hit. */
  raycast(origin: Vector3, direction: Vector3, maxDistance: number): EnemyHit | null {
    if (!this.alive) return null;
    // Cheap reject: skip the per-part work when the ray misses the whole body.
    const dx = this.position.x - origin.x;
    const dz = this.position.z - origin.z;
    const along = dx * direction.x + dz * direction.z;
    if (along < -2 || along > maxDistance + 2) return null;

    let best: EnemyHit | null = null;
    for (const p of this.#parts) {
      const t = intersectBox(origin, direction, p.worldBox, maxDistance);
      if (t === null) continue;
      if (best && t >= best.distance) continue;
      best = {
        part: p.kind,
        distance: t,
        point: new Vector3().copy(direction).multiplyScalar(t).add(origin),
      };
    }
    return best;
  }

  damage(amount: number, part: BodyPart, from: Vector3 | null): boolean {
    if (!this.alive) return false;
    this.health -= amount * PART_MULTIPLIER[part];
    this.#hitFlash = 1;

    if (from && this.state !== 'combat') {
      this.#lastKnown.copy(from);
      this.#hasLastKnown = true;
      this.#enter('combat');
    }

    if (this.health <= 0) {
      this.alive = false;
      this.state = 'dead';
      this.#deathTimer = 0;
      this.onKilled.emit({ enemy: this, part });
      return true;
    }
    return false;
  }

  /** Called when the player makes noise nearby. */
  hearNoise(position: Vector3, radius: number): void {
    if (!this.alive || this.state === 'combat') return;
    const d = this.position.distanceTo(position);
    if (d > Math.min(radius, this.archetype.hearingRange)) return;
    this.#lastKnown.copy(position);
    this.#hasLastKnown = true;
    this.#enter(this.state === 'suspicious' ? 'search' : 'suspicious');
  }

  /** Called by a squadmate who spotted the player. */
  alertTo(position: Vector3): void {
    if (!this.alive || this.state === 'combat') return;
    this.#lastKnown.copy(position);
    this.#hasLastKnown = true;
    this.#enter('combat');
  }

  #enter(state: EnemyState): void {
    if (this.state === state) return;
    const wasAware = this.aware;
    this.state = state;
    if (state === 'combat') {
      this.#burstLeft = 0;
      this.#shotTimer = this.archetype.reactionTime;
      if (!wasAware) this.onAlerted.emit(this);
    }
    if (state === 'search') this.#searchTimer = 9;
    if (state === 'suspicious') this.#sightTimer = 0;
  }

  #canSee(target: Vector3): boolean {
    const eye = this.eyePosition;
    const toTarget = _dir.copy(target).sub(eye);
    const distance = toTarget.length();
    if (distance > this.archetype.visionRange) return false;
    toTarget.divideScalar(distance);

    const facing = _facing.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const flat = _flat.set(toTarget.x, 0, toTarget.z).normalize();
    // Anyone within a couple of metres is noticed regardless of facing.
    if (distance > 2.5 && facing.dot(flat) < Math.cos(this.archetype.visionFov / 2)) return false;

    return this.#world.lineOfSight(eye, target);
  }

  update(dt: number, playerEye: Vector3, playerAlive: boolean, playerCrouched: boolean): void {
    if (!this.alive) {
      this.#updateDeath(dt);
      return;
    }

    const sees = playerAlive && this.#canSee(playerEye);
    if (sees) {
      this.#lastKnown.copy(playerEye);
      this.#hasLastKnown = true;
      this.#lostTimer = 0;
      // Crouching buys you the reaction window back.
      const rate = playerCrouched ? 0.55 : 1;
      this.#sightTimer += dt * rate;
      if (this.state !== 'combat' && this.#sightTimer >= this.archetype.reactionTime) {
        this.#enter('combat');
      } else if (this.state === 'idle' || this.state === 'patrol') {
        this.#enter('suspicious');
      }
    } else {
      this.#sightTimer = Math.max(0, this.#sightTimer - dt * 0.6);
      this.#lostTimer += dt;
      if (this.state === 'combat' && this.#lostTimer > 3.5) this.#enter('search');
      if (this.state === 'suspicious' && this.#lostTimer > 4) this.#enter('patrol');
    }

    switch (this.state) {
      case 'idle':
        this.#tickIdle(dt);
        break;
      case 'patrol':
        this.#tickPatrol(dt);
        break;
      case 'suspicious':
        this.#tickSuspicious(dt);
        break;
      case 'combat':
        this.#tickCombat(dt, playerEye, sees);
        break;
      case 'search':
        this.#tickSearch(dt);
        break;
    }

    this.#integrate(dt);
    this.#animate(dt);
    this.#refreshBoxes();
  }

  #tickIdle(dt: number): void {
    this.velocity.x = damp(this.velocity.x, 0, 10, dt);
    this.velocity.z = damp(this.velocity.z, 0, 10, dt);
    // Idle guards scan slowly, so they aren't statues.
    this.yaw += Math.sin(performance.now() / 2600 + this.position.x) * dt * 0.35;
  }

  #tickPatrol(dt: number): void {
    if (this.patrol.length < 2) {
      this.#tickIdle(dt);
      return;
    }
    if (this.#waitTimer > 0) {
      this.#waitTimer -= dt;
      this.#tickIdle(dt);
      return;
    }
    const target = this.patrol[this.#patrolIndex]!;
    if (this.#moveToward(target, this.archetype.patrolSpeed, dt) < 0.8) {
      this.#patrolIndex = (this.#patrolIndex + 1) % this.patrol.length;
      this.#waitTimer = randRange(0.6, 2.2);
    }
  }

  #tickSuspicious(dt: number): void {
    if (this.#hasLastKnown) this.#faceToward(this.#lastKnown, dt, 4);
    this.velocity.x = damp(this.velocity.x, 0, 8, dt);
    this.velocity.z = damp(this.velocity.z, 0, 8, dt);
  }

  #tickCombat(dt: number, playerEye: Vector3, sees: boolean): void {
    this.#faceToward(this.#lastKnown, dt, 9);

    const distance = this.position.distanceTo(this.#lastKnown);

    // Hold a working distance and keep sidestepping so they aren't a free
    // headshot standing still in the open.
    this.#strafeTimer -= dt;
    if (this.#strafeTimer <= 0) {
      this.#strafeTimer = randRange(0.8, 2.1);
      this.#strafe = Math.random() < 0.5 ? -1 : 1;
    }

    const forward = _facing.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = _right.set(forward.z, 0, -forward.x);
    const desired = _move.set(0, 0, 0);

    if (distance > 16) desired.addScaledVector(forward, 1);
    else if (distance < 6) desired.addScaledVector(forward, -1);
    desired.addScaledVector(right, this.#strafe * 0.85);

    if (desired.lengthSq() > 0) {
      desired.normalize().multiplyScalar(this.archetype.combatSpeed);
      this.velocity.x = damp(this.velocity.x, desired.x, 8, dt);
      this.velocity.z = damp(this.velocity.z, desired.z, 8, dt);
    }

    this.#shotTimer -= dt;
    if (!sees || this.#shotTimer > 0) return;

    const a = this.archetype;
    if (this.#burstLeft <= 0) {
      this.#burstLeft = a.burst;
      this.#shotTimer = 0;
    }

    const origin = this.eyePosition.clone().addScaledVector(forward, 0.4);
    const dir = _dir.copy(playerEye).sub(origin).normalize().clone();
    const spread = a.accuracy * this.aimError;
    dir.x += randRange(-spread, spread);
    dir.y += randRange(-spread, spread) * 0.6;
    dir.z += randRange(-spread, spread);
    dir.normalize();

    this.onShoot.emit({ origin, direction: dir, damage: a.damage, enemy: this });

    this.#burstLeft -= 1;
    this.#shotTimer = this.#burstLeft > 0 ? a.shotGap : a.burstGap;
  }

  #tickSearch(dt: number): void {
    this.#searchTimer -= dt;
    if (this.#searchTimer <= 0) {
      this.#enter(this.patrol.length > 1 ? 'patrol' : 'idle');
      this.#hasLastKnown = false;
      return;
    }
    if (this.#hasLastKnown) {
      const distance = this.#moveToward(this.#lastKnown, this.archetype.patrolSpeed * 1.4, dt);
      // Arrived at the noise and found nothing — sweep the area instead.
      if (distance < 1.2) this.yaw += dt * 1.5;
    }
  }

  #faceToward(target: Vector3, dt: number, rate: number): void {
    const wanted = Math.atan2(-(target.x - this.position.x), -(target.z - this.position.z));
    this.yaw += angleDelta(this.yaw, wanted) * clamp(rate * dt, 0, 1);
  }

  #moveToward(target: Vector3, speed: number, dt: number): number {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-3) return distance;
    this.#faceToward(target, dt, 6);
    this.velocity.x = damp(this.velocity.x, (dx / distance) * speed, 8, dt);
    this.velocity.z = damp(this.velocity.z, (dz / distance) * speed, 8, dt);
    return distance;
  }

  #integrate(dt: number): void {
    this.velocity.y -= 21 * dt;
    const result = moveBody(
      this.#world,
      this.position,
      this.velocity,
      { radius: RADIUS, height: HEIGHT },
      dt,
    );
    this.#groundSurface = result.ground;

    // Walked into a wall while patrolling: skip ahead rather than grind.
    if (result.hitWall && this.state === 'patrol' && this.patrol.length > 1) {
      this.#waitTimer = 0.25;
      this.#patrolIndex = (this.#patrolIndex + 1) % this.patrol.length;
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (result.grounded && speed > 0.3) {
      this.#stepAccumulator += speed * dt;
      if (this.#stepAccumulator >= 1.9) {
        this.#stepAccumulator = 0;
        this.onFootstep.emit({
          surface: this.#groundSurface ?? 'concrete',
          position: this.position.clone(),
        });
      }
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
  }

  #animate(dt: number): void {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.#walkPhase += dt * (2.4 + speed * 1.9);
    const swing = Math.min(speed / 3.4, 1) * 0.7;
    const s = Math.sin(this.#walkPhase);

    const legL = this.group.getObjectByName('legL');
    const legR = this.group.getObjectByName('legR');
    const armL = this.group.getObjectByName('armL');
    const armR = this.group.getObjectByName('armR');
    if (legL) legL.rotation.x = s * swing;
    if (legR) legR.rotation.x = -s * swing;
    if (armL) armL.rotation.x = -s * swing * 0.6;
    // The right arm holds the rifle, so it only sways when not aiming.
    if (armR) armR.rotation.x = this.state === 'combat' ? -0.35 : s * swing * 0.6;

    const rifle = this.group.getObjectByName('rifle');
    if (rifle) rifle.rotation.x = this.state === 'combat' ? -0.05 : 0.5;

    // Hit flash: the whole figure blanches for a beat, comic-book style.
    if (this.#hitFlash > 0) {
      this.#hitFlash = Math.max(0, this.#hitFlash - dt * 5);
      const k = this.#hitFlash;
      this.group.scale.setScalar(1 + k * 0.05);
    } else if (this.group.scale.x !== 1) {
      this.group.scale.setScalar(1);
    }
  }

  #updateDeath(dt: number): void {
    this.#deathTimer += dt;
    // A quick topple, then the body settles and stays as a marker.
    const t = Math.min(this.#deathTimer / 0.7, 1);
    const eased = t * t * (3 - 2 * t);
    this.group.rotation.x = eased * (Math.PI / 2) * 0.92;
    this.group.position.y = this.position.y + Math.sin(eased * Math.PI) * 0.12;
    if (this.#deathTimer < 0.7) {
      this.velocity.y -= 21 * dt;
      moveBody(this.#world, this.position, this.velocity, { radius: RADIUS, height: 0.4 }, dt);
      this.group.position.x = this.position.x;
      this.group.position.z = this.position.z;
    }
  }

  dispose(): void {
    for (const p of this.#parts) p.mesh.geometry.dispose();
    this.group.clear();
  }
}

/** Slab test used for body parts; returns entry distance or null. */
function intersectBox(
  origin: Vector3,
  direction: Vector3,
  box: Box3,
  maxDistance: number,
): number | null {
  let tmin = 0;
  let tmax = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const o = axis === 0 ? origin.x : axis === 1 ? origin.y : origin.z;
    const d = axis === 0 ? direction.x : axis === 1 ? direction.y : direction.z;
    const lo = axis === 0 ? box.min.x : axis === 1 ? box.min.y : box.min.z;
    const hi = axis === 0 ? box.max.x : axis === 1 ? box.max.y : box.max.z;
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (lo - o) * inv;
    let t2 = (hi - o) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin >= 0 && tmin <= maxDistance ? tmin : null;
}

const _eye = new Vector3();
const _dir = new Vector3();
const _facing = new Vector3();
const _flat = new Vector3();
const _right = new Vector3();
const _move = new Vector3();
