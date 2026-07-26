import { Group, Mesh, Object3D, Vector3 } from 'three';
import { clamp, damp } from '../core/mathx.ts';
import type { WeaponId } from './weapons.ts';
import { buildWeaponModel, type WeaponParts } from './weaponModels.ts';

/**
 * The view model.
 *
 * Everything the player actually feels about a weapon happens here: how it
 * lags behind the camera, how it settles after a shot, whether the slide
 * cycles. The whole point is that the gun is a physical object being carried,
 * not a decal stuck to the bottom of the screen.
 */

/**
 * Resting offsets from the camera, in camera space. Sat high enough that the
 * weapon is comfortably inside the frame on a short viewport — at the bottom
 * of a letterboxed window a lower rest position clips the gun away entirely.
 */
const HIP = new Vector3(0.16, -0.135, -0.36);
const HIP_MELEE = new Vector3(0.19, -0.19, -0.32);
const AIM = new Vector3(0, -0.07, -0.28);

interface WeaponRig extends WeaponParts {
  /** Bind-pose positions, so animated parts can return home exactly. */
  slideHome: Vector3 | null;
  magazineHome: Vector3 | null;
}

export class ViewModel {
  readonly root = new Group();
  #current: WeaponRig | null = null;
  #currentId: WeaponId | null = null;
  readonly #cache = new Map<WeaponId, WeaponRig>();

  #swayYaw = 0;
  #swayPitch = 0;
  #bobPhase = 0;
  #bobAmount = 0;
  #kick = 0;
  #kickVelocity = 0;
  #aim = 0;
  #lower = 0;
  #reload = 0;
  #reloadDuration = 0;
  #melee = 0;
  /** 0..1 cycle of the reciprocating mass; 1 is fully to the rear. */
  #cycle = 0;

  constructor() {
    this.root.name = 'viewmodel';
    // Rendered close to the near plane; the ink pass still outlines it, which
    // is what makes the weapon read as drawn rather than pasted on.
    this.root.renderOrder = 10;
  }

  get muzzleLocal(): Vector3 {
    const m = this.#current?.muzzle ?? [0, 0.02, -0.42];
    return _muzzle.set(m[0], m[1], m[2]);
  }

  get ejectorLocal(): Vector3 {
    const e = this.#current?.ejector ?? [0.03, 0.01, 0];
    return _ejector.set(e[0], e[1], e[2]);
  }

  select(id: WeaponId): void {
    if (this.#currentId === id) return;
    if (this.#current) this.root.remove(this.#current.root);

    let rig = this.#cache.get(id);
    if (!rig) {
      const parts = buildWeaponModel(id);
      rig = {
        ...parts,
        slideHome: parts.slide ? parts.slide.position.clone() : null,
        magazineHome: parts.magazine ? parts.magazine.position.clone() : null,
      };
      this.#cache.set(id, rig);
    }
    this.root.add(rig.root);
    this.#current = rig;
    this.#currentId = id;
    // Draw animation: the weapon rises into frame.
    this.#lower = 1;
  }

  punch(kickback: number): void {
    this.#kickVelocity += kickback * 26;
    // Cycling the action is what actually reads as "it fired", far more than
    // the whole model jerking backwards.
    this.#cycle = 1;
  }

  startReload(seconds: number): void {
    this.#reload = 1;
    this.#reloadDuration = Math.max(0.2, seconds);
  }

  cancelReload(): void {
    this.#reload = 0;
  }

  swingMelee(): void {
    this.#melee = 1;
  }

  update(
    dt: number,
    state: {
      lookYaw: number;
      lookPitch: number;
      speed: number;
      grounded: boolean;
      aiming: boolean;
      sprinting: boolean;
    },
  ): void {
    // Sway lags the camera by design — the gun is heavy.
    this.#swayYaw = damp(this.#swayYaw, clamp(state.lookYaw * 2.6, -0.09, 0.09), 9, dt);
    this.#swayPitch = damp(this.#swayPitch, clamp(state.lookPitch * 2.6, -0.09, 0.09), 9, dt);

    const walking = state.grounded && state.speed > 0.6;
    this.#bobPhase += dt * (6 + state.speed * 1.15);
    this.#bobAmount = damp(this.#bobAmount, walking ? Math.min(state.speed / 6, 1) : 0, 7, dt);

    this.#aim = damp(this.#aim, state.aiming && !state.sprinting ? 1 : 0, 14, dt);
    this.#lower = damp(this.#lower, state.sprinting ? 1 : 0, 10, dt);

    // Spring: recoil snaps back rather than lerping, so rapid fire stacks.
    this.#kickVelocity -= this.#kick * 190 * dt;
    this.#kickVelocity *= Math.exp(-16 * dt);
    this.#kick += this.#kickVelocity * dt;

    // The action cycles fast and returns fast — roughly 60 ms out and back.
    this.#cycle = Math.max(0, this.#cycle - dt * 16);

    if (this.#reload > 0) {
      this.#reload = Math.max(0, this.#reload - dt / this.#reloadDuration);
    }
    if (this.#melee > 0) {
      this.#melee = Math.max(0, this.#melee - dt * 4.5);
    }

    const rest = this.#currentId === 'fists' ? HIP_MELEE : HIP;
    const target = _pos.copy(rest).lerp(AIM, this.#aim);

    const bobX = Math.cos(this.#bobPhase) * 0.016 * this.#bobAmount * (1 - this.#aim * 0.75);
    const bobY =
      Math.abs(Math.sin(this.#bobPhase)) * 0.014 * this.#bobAmount * (1 - this.#aim * 0.75);

    // Reload: a single sine arc that dips the gun and rolls it inward.
    const reloadArc = Math.sin(this.#reload * Math.PI);
    // Melee: a fast lunge forward-left.
    const meleeArc = Math.sin(this.#melee * Math.PI);

    this.root.position.set(
      target.x + bobX + this.#swayYaw * 0.4 + this.#lower * 0.11 - meleeArc * 0.1,
      target.y -
        bobY +
        this.#swayPitch * 0.4 -
        this.#lower * 0.14 -
        reloadArc * 0.14 -
        meleeArc * 0.03,
      target.z + this.#kick - this.#lower * 0.05 - meleeArc * 0.16,
    );

    this.root.rotation.set(
      this.#swayPitch * 1.5 -
        this.#kick * 2.4 +
        reloadArc * 0.5 +
        this.#lower * 0.32 +
        meleeArc * 0.4,
      this.#swayYaw * 1.5 - reloadArc * 0.42 - this.#lower * 0.5 + meleeArc * 0.5,
      this.#lower * 0.42 + reloadArc * 0.25 + Math.cos(this.#bobPhase) * 0.01 * this.#bobAmount,
    );

    this.#animateParts(reloadArc);
  }

  /** Drives the moving parts: slide travel, magazine drop, hammer fall. */
  #animateParts(reloadArc: number): void {
    const rig = this.#current;
    if (!rig) return;

    if (rig.slide && rig.slideHome) {
      // A shotgun's pump and a rifle's bolt travel further than a pistol slide.
      const travel =
        this.#currentId === 'shotgun' ? 0.1 : this.#currentId === 'rifle' ? 0.07 : 0.045;
      // Out fast, back slower: sin gives the wrong shape, so the return is a
      // squared falloff.
      const t = this.#cycle;
      const out = t > 0.55 ? (1 - t) / 0.45 : t / 0.55;
      rig.slide.position.z = rig.slideHome.z + out * travel;
    }

    if (rig.magazine && rig.magazineHome) {
      // The magazine leaves the well in the first third of the reload and the
      // fresh one seats in the last third.
      const drop = reloadArc > 0 ? Math.sin(clamp(this.#reload, 0, 1) * Math.PI) : 0;
      rig.magazine.position.y = rig.magazineHome.y - drop * 0.22;
      rig.magazine.position.z = rig.magazineHome.z + drop * 0.05;
    }

    if (rig.hammer) {
      // Cocked at rest, dropped the instant the shot breaks.
      rig.hammer.rotation.x = this.#cycle > 0.1 ? 0.1 : -0.5;
    }
  }

  /** 0 while aiming is idle, 1 when fully sighted — drives the camera FOV. */
  get aimBlend(): number {
    return this.#aim * (1 - this.#lower);
  }

  attachTo(camera: Object3D): void {
    camera.add(this.root);
  }

  dispose(): void {
    for (const rig of this.#cache.values()) {
      rig.root.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    }
    this.#cache.clear();
  }
}

const _muzzle = new Vector3();
const _ejector = new Vector3();
const _pos = new Vector3();
