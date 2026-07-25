import { BoxGeometry, CylinderGeometry, Group, Mesh, Object3D, Vector3 } from 'three';
import { PALETTE } from '../render/palette.ts';
import { toon } from '../render/toon.ts';
import { clamp, damp } from '../core/mathx.ts';
import type { WeaponId } from './weapons.ts';

const gun = toon(PALETTE.steelDark, { ramp: 'trio' });
const gunLight = toon(PALETTE.steel, { ramp: 'trio' });
const grip = toon(PALETTE.woodDark, { ramp: 'trio' });
const skin = toon(0xd9a877, { ramp: 'trio' });
const glove = toon(0x2f3742, { ramp: 'trio' });

function box(w: number, h: number, d: number, material = gun): Mesh {
  return new Mesh(new BoxGeometry(w, h, d), material);
}

function at(mesh: Mesh, x: number, y: number, z: number): Mesh {
  mesh.position.set(x, y, z);
  return mesh;
}

/** A pair of blocky hands, so the weapon doesn't float in a void. */
function hands(): Group {
  const g = new Group();
  const right = at(box(0.075, 0.075, 0.12, glove), 0.012, -0.075, 0.055);
  const left = at(box(0.07, 0.07, 0.11, glove), -0.055, -0.06, -0.02);
  left.rotation.y = 0.3;
  const thumb = at(box(0.03, 0.03, 0.055, skin), 0.045, -0.045, 0.02);
  g.add(right, left, thumb);
  return g;
}

function buildColt(): Group {
  const g = new Group();
  g.add(at(box(0.05, 0.055, 0.26), 0, 0, -0.06)); // slide
  g.add(at(box(0.044, 0.03, 0.2, gunLight), 0, -0.042, -0.045)); // frame
  const handle = at(box(0.046, 0.13, 0.06, grip), 0, -0.11, 0.045);
  handle.rotation.x = -0.24;
  g.add(handle);
  g.add(at(box(0.012, 0.02, 0.012, gunLight), 0, 0.035, -0.175)); // front sight
  g.add(hands());
  return g;
}

function buildSilenced(): Group {
  const g = new Group();
  g.add(at(box(0.045, 0.05, 0.22), 0, 0, -0.04));
  const can = new Mesh(new CylinderGeometry(0.032, 0.032, 0.19, 10), gunLight);
  can.rotation.x = Math.PI / 2;
  can.position.set(0, 0.004, -0.24);
  g.add(can);
  const handle = at(box(0.042, 0.12, 0.055, grip), 0, -0.1, 0.04);
  handle.rotation.x = -0.22;
  g.add(handle);
  g.add(hands());
  return g;
}

function buildSmg(): Group {
  const g = new Group();
  g.add(at(box(0.06, 0.075, 0.3), 0, 0, -0.07)); // receiver
  const barrel = new Mesh(new CylinderGeometry(0.017, 0.017, 0.17, 8), gunLight);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.3);
  g.add(barrel);
  g.add(at(box(0.04, 0.17, 0.05, gunLight), 0, -0.12, -0.03)); // magazine
  const handle = at(box(0.044, 0.11, 0.055, grip), 0, -0.095, 0.075);
  handle.rotation.x = -0.2;
  g.add(handle);
  g.add(at(box(0.035, 0.05, 0.16, gunLight), 0, -0.005, 0.2)); // folding stock
  g.add(hands());
  return g;
}

function buildShotgun(): Group {
  const g = new Group();
  const barrel = new Mesh(new CylinderGeometry(0.028, 0.028, 0.42, 10), gun);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.2);
  g.add(barrel);
  const pump = new Mesh(new CylinderGeometry(0.034, 0.034, 0.14, 8), grip);
  pump.rotation.x = Math.PI / 2;
  pump.position.set(0, -0.025, -0.2);
  pump.name = 'pump';
  g.add(pump);
  g.add(at(box(0.055, 0.075, 0.22, gunLight), 0, -0.005, 0.02)); // receiver
  const stock = at(box(0.05, 0.1, 0.16, grip), 0, -0.075, 0.16);
  stock.rotation.x = 0.18;
  g.add(stock);
  g.add(hands());
  return g;
}

function buildRifle(): Group {
  const g = new Group();
  const barrel = new Mesh(new CylinderGeometry(0.016, 0.02, 0.62, 10), gun);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.025, -0.32);
  g.add(barrel);
  g.add(at(box(0.05, 0.07, 0.26, gunLight), 0, 0, -0.02)); // action
  const stockWood = at(box(0.055, 0.1, 0.46, grip), 0, -0.05, 0.14);
  stockWood.rotation.x = 0.09;
  g.add(stockWood);
  const scope = new Mesh(new CylinderGeometry(0.026, 0.026, 0.22, 10), gun);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.075, -0.08);
  scope.name = 'scope';
  g.add(scope);
  const bolt = at(box(0.02, 0.02, 0.09, gunLight), 0.04, 0.015, 0.03);
  bolt.name = 'bolt';
  g.add(bolt);
  g.add(hands());
  return g;
}

function buildFists(): Group {
  const g = new Group();
  const right = at(box(0.1, 0.1, 0.15, glove), 0.05, -0.06, -0.05);
  right.rotation.set(0.1, -0.25, 0.1);
  const left = at(box(0.095, 0.095, 0.14, glove), -0.09, -0.11, 0.02);
  left.rotation.set(0.05, 0.3, -0.1);
  g.add(right, left);
  return g;
}

function buildGrapnel(): Group {
  const g = new Group();
  g.add(at(box(0.08, 0.09, 0.16, gunLight), 0, -0.02, -0.04));
  const spool = new Mesh(new CylinderGeometry(0.05, 0.05, 0.05, 10), gun);
  spool.rotation.z = Math.PI / 2;
  spool.position.set(0, 0.03, 0.02);
  g.add(spool);
  const hook = at(box(0.02, 0.09, 0.02, gun), 0, 0.02, -0.15);
  g.add(hook);
  g.add(hands());
  return g;
}

const BUILDERS: Record<WeaponId, () => Group> = {
  fists: buildFists,
  colt: buildColt,
  silenced: buildSilenced,
  smg: buildSmg,
  shotgun: buildShotgun,
  rifle: buildRifle,
  grapnel: buildGrapnel,
};

/** Resting offset from the camera, in camera space. */
const HIP = new Vector3(0.17, -0.16, -0.34);
const HIP_MELEE = new Vector3(0.2, -0.22, -0.3);
const AIM = new Vector3(0, -0.075, -0.26);

/**
 * The view model: builds a blocky weapon per id and animates the whole feel of
 * holding it — sway from mouse movement, bob from walking, recoil punch,
 * lowering when sprinting, and a reload that actually rotates the gun out of
 * frame instead of just ticking a timer.
 */
export class ViewModel {
  readonly root = new Group();
  #current: Group | null = null;
  #currentId: WeaponId | null = null;
  readonly #cache = new Map<WeaponId, Group>();

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

  constructor() {
    this.root.name = 'viewmodel';
    // Rendered close to the near plane; the ink pass still outlines it, which
    // is what makes the weapon read as drawn rather than pasted on.
    this.root.renderOrder = 10;
  }

  get muzzleLocal(): Vector3 {
    return _muzzle.set(0, 0.02, -0.42);
  }

  select(id: WeaponId): void {
    if (this.#currentId === id) return;
    if (this.#current) this.root.remove(this.#current);
    let g = this.#cache.get(id);
    if (!g) {
      g = BUILDERS[id]();
      this.#cache.set(id, g);
    }
    this.root.add(g);
    this.#current = g;
    this.#currentId = id;
    // Draw animation: the weapon rises into frame.
    this.#lower = 1;
  }

  punch(kickback: number): void {
    this.#kickVelocity += kickback * 26;
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

    // The pump/bolt actually cycles during a reload — small, but it reads.
    const cycled = this.#current?.getObjectByName('pump') ?? this.#current?.getObjectByName('bolt');
    if (cycled)
      cycled.position.z = (cycled.userData.baseZ ??= cycled.position.z) + reloadArc * 0.09;
  }

  /** 0 while aiming is idle, 1 when fully sighted — drives the camera FOV. */
  get aimBlend(): number {
    return this.#aim * (1 - this.#lower);
  }

  attachTo(camera: Object3D): void {
    camera.add(this.root);
  }

  dispose(): void {
    for (const g of this.#cache.values()) {
      g.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
    }
    this.#cache.clear();
  }
}

const _muzzle = new Vector3();
const _pos = new Vector3();
