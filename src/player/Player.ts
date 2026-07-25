import { PerspectiveCamera, Vector3 } from 'three';
import { Signal } from '../core/signal.ts';
import { clamp, damp, randRange } from '../core/mathx.ts';
import type { Input } from '../core/Input.ts';
import { bodyFits, type BrushWorld, moveBody, type Surface } from '../world/Collision.ts';
import { ViewModel } from './ViewModel.ts';
import {
  secondsPerShot,
  WEAPONS,
  WEAPON_ORDER,
  type AmmoState,
  type WeaponDef,
  type WeaponId,
} from './weapons.ts';

export interface ShotEvent {
  origin: Vector3;
  direction: Vector3;
  weapon: WeaponDef;
  pelletIndex: number;
}

export interface NoiseEvent {
  position: Vector3;
  radius: number;
}

export interface DamageEvent {
  amount: number;
  from: Vector3 | null;
  fatal: boolean;
}

const STANCE = {
  stand: { height: 1.8, eye: 1.63, speed: 4.6 },
  crouch: { height: 1.15, eye: 1.0, speed: 2.15 },
} as const;

const RADIUS = 0.34;
const SPRINT_SPEED = 7.3;
const GRAVITY = 21;
const JUMP_VELOCITY = 6.1;
const GROUND_ACCEL = 68;
const AIR_ACCEL = 14;
const GROUND_FRICTION = 11;
const MAX_PITCH = Math.PI / 2 - 0.02;
const STEP_DISTANCE = 2.1;

export class Player {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly camera: PerspectiveCamera;
  readonly viewModel = new ViewModel();

  readonly onShot = new Signal<ShotEvent>();
  readonly onNoise = new Signal<NoiseEvent>();
  readonly onDamaged = new Signal<DamageEvent>();
  readonly onDied = new Signal<void>();
  readonly onMelee = new Signal<{ origin: Vector3; direction: Vector3; damage: number }>();
  readonly onFootstep = new Signal<{ surface: Surface; position: Vector3 }>();
  readonly onShellEjected = new Signal<{ position: Vector3; direction: Vector3 }>();
  readonly onWeaponChanged = new Signal<WeaponId>();
  readonly onReloadStarted = new Signal<WeaponId>();
  readonly onDryFire = new Signal<WeaponId>();
  readonly onLanded = new Signal<{ surface: Surface; force: number }>();

  yaw = 0;
  pitch = 0;
  health = 100;
  maxHealth = 100;
  armour = 0;
  alive = true;
  /** Scales incoming damage; set from the difficulty setting. */
  damageTaken = 1;
  baseFov = 72;

  #stance: keyof typeof STANCE = 'stand';
  #eyeHeight: number = STANCE.stand.eye;
  #grounded = false;
  #groundSurface: Surface | null = null;
  #stepAccumulator = 0;
  #coyote = 0;
  #jumpBuffer = 0;
  #lean = 0;
  #leanTarget = 0;

  #recoilPitch = 0;
  #recoilYaw = 0;
  #recoilVelocityPitch = 0;
  #recoilVelocityYaw = 0;
  #shake = 0;

  #cooldown = 0;
  #reloadTimer = 0;
  #reloading = false;
  #meleeCooldown = 0;
  #regenDelay = 0;

  readonly ammo = new Map<WeaponId, AmmoState>();
  readonly owned: WeaponId[] = ['fists'];
  current: WeaponId = 'fists';

  readonly #world: BrushWorld;
  readonly #axis = { x: 0, y: 0 };
  readonly #look = { yaw: 0, pitch: 0 };

  constructor(world: BrushWorld, camera: PerspectiveCamera) {
    this.#world = world;
    this.camera = camera;
    this.viewModel.attachTo(camera);
    this.viewModel.select('fists');
    this.ammo.set('fists', { mag: Infinity, reserve: 0 });
  }

  get stance(): keyof typeof STANCE {
    return this.#stance;
  }

  get grounded(): boolean {
    return this.#grounded;
  }

  get weapon(): WeaponDef {
    return WEAPONS[this.current];
  }

  get currentAmmo(): AmmoState {
    let a = this.ammo.get(this.current);
    if (!a) {
      a = { mag: 0, reserve: 0 };
      this.ammo.set(this.current, a);
    }
    return a;
  }

  get reloading(): boolean {
    return this.#reloading;
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get aiming(): boolean {
    return this.viewModel.aimBlend > 0.5;
  }

  spawn(position: Vector3, yaw: number): void {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.alive = true;
    this.#stance = 'stand';
    this.#eyeHeight = STANCE.stand.eye;
    this.#recoilPitch = this.#recoilYaw = 0;
    this.#reloading = false;
    this.#reloadTimer = 0;
    this.#cooldown = 0;
    this.viewModel.cancelReload();
  }

  giveWeapon(id: WeaponId, magazines = 2): boolean {
    const def = WEAPONS[id];
    const isNew = !this.owned.includes(id);
    if (isNew) {
      this.owned.push(id);
      this.owned.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));
      this.ammo.set(id, {
        mag: def.magSize === Infinity ? Infinity : def.magSize,
        reserve: Math.min(def.reserveMax, def.magSize * magazines),
      });
      this.select(id);
    } else {
      this.giveAmmo(id, def.magSize * magazines);
    }
    return isNew;
  }

  giveAmmo(id: WeaponId, rounds: number): number {
    const def = WEAPONS[id];
    const state = this.ammo.get(id);
    if (!state || def.reserveMax === 0) return 0;
    const before = state.reserve;
    state.reserve = Math.min(def.reserveMax, state.reserve + rounds);
    return state.reserve - before;
  }

  heal(amount: number): number {
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - before;
  }

  select(id: WeaponId): void {
    if (!this.owned.includes(id) || this.current === id) return;
    this.current = id;
    this.#reloading = false;
    this.#reloadTimer = 0;
    this.viewModel.cancelReload();
    this.viewModel.select(id);
    // Swapping is not free; you cannot dodge a reload by cycling weapons.
    this.#cooldown = Math.max(this.#cooldown, 0.35);
    this.onWeaponChanged.emit(id);
  }

  cycleWeapon(direction: number): void {
    if (this.owned.length < 2) return;
    const i = this.owned.indexOf(this.current);
    const next = this.owned[(i + direction + this.owned.length) % this.owned.length]!;
    this.select(next);
  }

  applyDamage(amount: number, from: Vector3 | null): void {
    if (!this.alive) return;
    const scaled = amount * this.damageTaken;
    // Armour eats two thirds of what lands, and is consumed doing it.
    const absorbed = Math.min(this.armour, scaled * 0.66);
    this.armour -= absorbed;
    const toHealth = scaled - absorbed;

    this.health -= toHealth;
    this.#regenDelay = 5.5;
    this.#shake = Math.min(1, this.#shake + toHealth / 45);

    const fatal = this.health <= 0;
    this.onDamaged.emit({ amount: toHealth, from, fatal });

    if (fatal) {
      this.health = 0;
      this.alive = false;
      this.onDied.emit();
    }
  }

  /** Refuse to stand back up under a low ceiling, rather than clipping through it. */
  #canStand(): boolean {
    return bodyFits(this.#world, this.position, {
      radius: RADIUS - 0.02,
      height: STANCE.stand.height,
    });
  }

  update(dt: number, input: Input, canAct: boolean): void {
    this.#updateLook(dt, input, canAct);
    this.#updateMovement(dt, input, canAct);
    this.#updateWeapon(dt, input, canAct);
    this.#updateCamera(dt);
    this.#updateRegen(dt);
  }

  #updateLook(dt: number, input: Input, canAct: boolean): void {
    if (canAct) {
      input.lookDelta(this.#look);
      // Aiming down the sights slows the turn rate proportionally to the zoom.
      const aimScale = 1 - this.viewModel.aimBlend * (1 - this.weapon.aimFov) * 0.8;
      this.yaw += this.#look.yaw * aimScale;
      this.pitch = clamp(this.pitch + this.#look.pitch * aimScale, -MAX_PITCH, MAX_PITCH);
    } else {
      this.#look.yaw = 0;
      this.#look.pitch = 0;
    }

    // Recoil is a spring on top of the aim, so it recovers toward where you
    // were pointing rather than permanently stealing your aim.
    this.#recoilVelocityPitch -= this.#recoilPitch * 240 * dt;
    this.#recoilVelocityYaw -= this.#recoilYaw * 240 * dt;
    this.#recoilVelocityPitch *= Math.exp(-13 * dt);
    this.#recoilVelocityYaw *= Math.exp(-13 * dt);
    this.#recoilPitch += this.#recoilVelocityPitch * dt;
    this.#recoilYaw += this.#recoilVelocityYaw * dt;

    this.#shake = Math.max(0, this.#shake - dt * 1.6);
  }

  #updateMovement(dt: number, input: Input, canAct: boolean): void {
    if (canAct) input.moveAxis(this.#axis);
    else {
      this.#axis.x = 0;
      this.#axis.y = 0;
    }

    const wantsCrouch = canAct && input.held('crouch');
    if (wantsCrouch && this.#stance === 'stand') this.#stance = 'crouch';
    else if (!wantsCrouch && this.#stance === 'crouch' && this.#canStand()) this.#stance = 'stand';

    const stance = STANCE[this.#stance];
    const sprinting =
      canAct &&
      input.held('sprint') &&
      this.#stance === 'stand' &&
      this.#axis.y > 0.1 &&
      !this.#reloading;

    const targetSpeed = sprinting ? SPRINT_SPEED : stance.speed;

    // Wish direction in world space.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wishX = this.#axis.x * cos - this.#axis.y * sin;
    const wishZ = -this.#axis.x * sin - this.#axis.y * cos;

    const accel = this.#grounded ? GROUND_ACCEL : AIR_ACCEL;
    this.velocity.x += wishX * accel * dt;
    this.velocity.z += wishZ * accel * dt;

    if (this.#grounded) {
      const drag = Math.exp(-GROUND_FRICTION * dt);
      if (this.#axis.x === 0 && this.#axis.y === 0) {
        this.velocity.x *= drag;
        this.velocity.z *= drag;
      }
      const planar = Math.hypot(this.velocity.x, this.velocity.z);
      if (planar > targetSpeed) {
        const scale = targetSpeed / planar;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    } else {
      const planar = Math.hypot(this.velocity.x, this.velocity.z);
      const airCap = SPRINT_SPEED * 1.12;
      if (planar > airCap) {
        const scale = airCap / planar;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    }

    // Coyote time + jump buffering: both are invisible when they work and
    // extremely obvious when they're missing.
    this.#coyote = this.#grounded ? 0.12 : Math.max(0, this.#coyote - dt);
    if (canAct && input.pressed('jump')) this.#jumpBuffer = 0.14;
    else this.#jumpBuffer = Math.max(0, this.#jumpBuffer - dt);

    if (this.#jumpBuffer > 0 && this.#coyote > 0 && this.#stance === 'stand') {
      this.velocity.y = JUMP_VELOCITY;
      this.#jumpBuffer = 0;
      this.#coyote = 0;
      this.#grounded = false;
    }

    this.velocity.y -= GRAVITY * dt;

    const wasGrounded = this.#grounded;
    const fallSpeed = -this.velocity.y;
    const result = moveBody(
      this.#world,
      this.position,
      this.velocity,
      { radius: RADIUS, height: stance.height },
      dt,
    );
    this.#grounded = result.grounded;
    this.#groundSurface = result.ground;

    if (!wasGrounded && result.grounded && fallSpeed > 4) {
      this.onLanded.emit({ surface: result.ground ?? 'concrete', force: fallSpeed });
      this.#shake = Math.min(1, this.#shake + fallSpeed / 60);
      // Anything past a two-storey drop starts costing health.
      if (fallSpeed > 15) this.applyDamage((fallSpeed - 15) * 5.5, null);
    }

    // Footsteps are distance-based, so they stay in step at any speed.
    if (this.#grounded) {
      this.#stepAccumulator += this.speed * dt;
      const interval = sprinting ? STEP_DISTANCE * 0.82 : STEP_DISTANCE;
      if (this.#stepAccumulator >= interval) {
        this.#stepAccumulator = 0;
        const surface = this.#groundSurface ?? 'concrete';
        this.onFootstep.emit({ surface, position: this.position.clone() });
        if (this.#stance !== 'crouch') {
          this.onNoise.emit({
            position: this.position.clone(),
            radius: sprinting ? 15 : 8,
          });
        }
      }
    }

    this.#leanTarget = canAct && input.held('lean-left') ? 1 : 0;
    this.#lean = damp(this.#lean, this.#leanTarget, 9, dt);
  }

  #updateWeapon(dt: number, input: Input, canAct: boolean): void {
    this.#cooldown = Math.max(0, this.#cooldown - dt);
    this.#meleeCooldown = Math.max(0, this.#meleeCooldown - dt);

    if (this.#reloading) {
      this.#reloadTimer -= dt;
      if (this.#reloadTimer <= 0) this.#finishReload();
    }

    const def = this.weapon;
    const ammo = this.currentAmmo;

    if (canAct) {
      if (input.wheelDelta !== 0) this.cycleWeapon(input.wheelDelta > 0 ? 1 : -1);
      if (input.pressed('weapon-next')) this.cycleWeapon(1);
      if (input.pressed('weapon-prev')) this.cycleWeapon(-1);

      if (input.pressed('reload')) this.startReload();

      if (input.pressed('melee') && this.#meleeCooldown <= 0) {
        this.#meleeCooldown = 0.62;
        this.viewModel.swingMelee();
        const dir = this.lookDirection(new Vector3());
        this.onMelee.emit({
          origin: this.eyePosition(new Vector3()),
          direction: dir,
          damage: this.current === 'fists' ? WEAPONS.fists.damage : 46,
        });
      }

      const wantsFire = def.automatic ? input.held('fire') : input.pressed('fire');
      if (wantsFire && this.#cooldown <= 0 && !this.#reloading) {
        if (def.kind === 'melee') {
          this.#cooldown = secondsPerShot(def);
          this.viewModel.swingMelee();
          this.onMelee.emit({
            origin: this.eyePosition(new Vector3()),
            direction: this.lookDirection(new Vector3()),
            damage: def.damage,
          });
        } else if (ammo.mag > 0) {
          this.#fire(def, ammo);
        } else if (ammo.reserve > 0) {
          this.startReload();
        } else {
          this.#cooldown = 0.35;
          this.onDryFire.emit(this.current);
        }
      }
    }

    this.viewModel.update(dt, {
      lookYaw: this.#look.yaw,
      lookPitch: this.#look.pitch,
      speed: this.speed,
      grounded: this.#grounded,
      aiming: canAct && input.held('aim') && !this.#reloading,
      sprinting: canAct && input.held('sprint') && this.#axis.y > 0.1 && this.#stance === 'stand',
    });
  }

  #fire(def: WeaponDef, ammo: AmmoState): void {
    ammo.mag -= 1;
    this.#cooldown = secondsPerShot(def);

    const origin = this.eyePosition(new Vector3());
    const forward = this.lookDirection(new Vector3());
    const aimBlend = this.viewModel.aimBlend;
    const spread = def.spread * (1 - aimBlend * (1 - def.aimSpread));
    // Crouching steadies the shot; sprinting is not modelled because the view
    // model is lowered and firing is blocked by the aim check anyway.
    const stanceScale = this.#stance === 'crouch' ? 0.62 : 1;
    const moving = clamp(this.speed / SPRINT_SPEED, 0, 1);
    const finalSpread = spread * stanceScale * (1 + moving * 0.9);

    for (let i = 0; i < def.pellets; i++) {
      const dir = forward.clone();
      if (finalSpread > 0) {
        const angle = randRange(0, Math.PI * 2);
        // sqrt keeps pellets evenly distributed across the cone's area.
        const radius = Math.sqrt(Math.random()) * finalSpread;
        const right = _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const up = _up.crossVectors(right, forward).normalize();
        dir.addScaledVector(right, Math.cos(angle) * radius);
        dir.addScaledVector(up, Math.sin(angle) * radius);
        dir.normalize();
      }
      this.onShot.emit({ origin: origin.clone(), direction: dir, weapon: def, pelletIndex: i });
    }

    this.#recoilVelocityPitch += def.recoilPitch * (1 - aimBlend * 0.35) * 34;
    this.#recoilVelocityYaw += randRange(-def.recoilYaw, def.recoilYaw) * 34;
    this.#shake = Math.min(1, this.#shake + def.kickback * 0.9);
    this.viewModel.punch(def.kickback);

    this.onNoise.emit({ position: this.position.clone(), radius: def.noiseRadius });

    if (def.ejectsShell) {
      const right = _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.onShellEjected.emit({
        position: origin.clone().addScaledVector(right, 0.2).addScaledVector(forward, 0.25),
        direction: right.clone().multiplyScalar(2.2).setY(2.4),
      });
    }
  }

  startReload(): void {
    const def = this.weapon;
    const ammo = this.currentAmmo;
    if (
      this.#reloading ||
      def.magSize === Infinity ||
      ammo.mag >= def.magSize ||
      ammo.reserve <= 0
    ) {
      return;
    }
    this.#reloading = true;
    this.#reloadTimer = def.reloadSeconds;
    this.viewModel.startReload(def.reloadSeconds);
    this.onReloadStarted.emit(this.current);
  }

  #finishReload(): void {
    const def = this.weapon;
    const ammo = this.currentAmmo;
    const needed = def.magSize - ammo.mag;
    const taken = Math.min(needed, ammo.reserve);
    ammo.mag += taken;
    ammo.reserve -= taken;
    this.#reloading = false;
  }

  #updateCamera(dt: number): void {
    const stance = STANCE[this.#stance];
    this.#eyeHeight = damp(this.#eyeHeight, stance.eye, 12, dt);

    const shake = this.#shake * this.#shake;
    const t = performance.now() / 1000;
    const shakeX = Math.sin(t * 47) * shake * 0.022;
    const shakeY = Math.cos(t * 53) * shake * 0.022;

    // Leaning slides the eye sideways and rolls the horizon — pure XIII.
    const leanOffsetX = Math.cos(this.yaw) * this.#lean * 0.45;
    const leanOffsetZ = -Math.sin(this.yaw) * this.#lean * 0.45;

    this.camera.position.set(
      this.position.x - leanOffsetX,
      this.position.y + this.#eyeHeight,
      this.position.z - leanOffsetZ,
    );
    this.camera.rotation.set(
      this.pitch + this.#recoilPitch + shakeY,
      this.yaw + this.#recoilYaw + shakeX,
      this.#lean * 0.16,
      'YXZ',
    );

    const targetFov = this.baseFov * (1 - this.viewModel.aimBlend * (1 - this.weapon.aimFov));
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  #updateRegen(dt: number): void {
    if (!this.alive) return;
    this.#regenDelay = Math.max(0, this.#regenDelay - dt);
    // Only the last slice of the bar regenerates; real damage needs a medkit.
    if (this.#regenDelay === 0 && this.health < 35) {
      this.health = Math.min(35, this.health + dt * 6);
    }
  }

  eyePosition(out: Vector3): Vector3 {
    return out.set(this.position.x, this.position.y + this.#eyeHeight, this.position.z);
  }

  lookDirection(out: Vector3): Vector3 {
    const cosPitch = Math.cos(this.pitch + this.#recoilPitch);
    return out
      .set(
        -Math.sin(this.yaw + this.#recoilYaw) * cosPitch,
        Math.sin(this.pitch + this.#recoilPitch),
        -Math.cos(this.yaw + this.#recoilYaw) * cosPitch,
      )
      .normalize();
  }

  addShake(amount: number): void {
    this.#shake = Math.min(1, this.#shake + amount);
  }
}

const _right = new Vector3();
const _up = new Vector3();
