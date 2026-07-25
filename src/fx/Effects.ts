import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from 'three';
import { PALETTE, color } from '../render/palette.ts';
import { toon } from '../render/toon.ts';
import { randRange } from '../core/mathx.ts';
import type { Surface } from '../world/Collision.ts';
import { moveBody, type BrushWorld } from '../world/Collision.ts';

const MAX_DECALS = 120;
const MAX_SHELLS = 48;
const MAX_SPARKS = 260;

interface Tracer {
  line: Line;
  life: number;
  maxLife: number;
}

interface Shell {
  position: Vector3;
  velocity: Vector3;
  spin: Vector3;
  life: number;
  index: number;
}

interface Spark {
  position: Vector3;
  velocity: Vector3;
  life: number;
  maxLife: number;
  size: number;
  colour: Color;
}

const IMPACT_COLOUR: Record<Surface, number> = {
  snow: 0xffffff,
  wood: PALETTE.woodDark,
  metal: 0xffd98a,
  concrete: 0xb9b2a6,
  glass: 0xcfe6ef,
  flesh: PALETTE.blood,
};

/**
 * All the short-lived visual noise: tracers, sparks, blood, bullet holes,
 * shell casings and muzzle flashes. Everything is pooled — a firefight must
 * not allocate.
 */
export class Effects {
  readonly group = new Group();

  readonly #tracers: Tracer[] = [];
  readonly #tracerPool: Tracer[] = [];

  readonly #decals: InstancedMesh;
  #decalCursor = 0;
  readonly #decalDummy = new Object3D();

  readonly #shellMesh: InstancedMesh;
  readonly #shells: Shell[] = [];
  #shellCursor = 0;
  readonly #shellDummy = new Object3D();

  readonly #sparkMesh: InstancedMesh;
  readonly #sparks: Spark[] = [];
  #sparkCursor = 0;
  readonly #sparkDummy = new Object3D();

  readonly #muzzle: Mesh;
  #muzzleLife = 0;

  readonly #world: BrushWorld;

  constructor(world: BrushWorld) {
    this.#world = world;
    this.group.name = 'effects';

    // Bullet holes: flat quads pushed slightly off the surface they hit.
    this.#decals = new InstancedMesh(
      new PlaneGeometry(0.11, 0.11),
      new MeshBasicMaterial({
        color: color(PALETTE.ink),
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
      }),
      MAX_DECALS,
    );
    this.#decals.frustumCulled = false;
    this.#decals.count = MAX_DECALS;
    this.#hideAll(this.#decals, MAX_DECALS);
    this.group.add(this.#decals);

    this.#shellMesh = new InstancedMesh(
      new BoxGeometry(0.018, 0.018, 0.05),
      toon(0xc9a24a, { ramp: 'flat' }),
      MAX_SHELLS,
    );
    this.#shellMesh.frustumCulled = false;
    this.#hideAll(this.#shellMesh, MAX_SHELLS);
    this.group.add(this.#shellMesh);

    this.#sparkMesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ vertexColors: false, toneMapped: false }),
      MAX_SPARKS,
    );
    this.#sparkMesh.frustumCulled = false;
    this.#sparkMesh.instanceColor = null;
    this.#hideAll(this.#sparkMesh, MAX_SPARKS);
    this.group.add(this.#sparkMesh);

    const flash = new ConeGeometry(0.09, 0.28, 5);
    flash.rotateX(-Math.PI / 2);
    this.#muzzle = new Mesh(
      flash,
      new MeshBasicMaterial({
        color: color(PALETTE.onomatopoeia),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.#muzzle.visible = false;
    this.#muzzle.renderOrder = 20;

    for (let i = 0; i < MAX_SPARKS; i++) {
      this.#sparks.push({
        position: new Vector3(),
        velocity: new Vector3(),
        life: 0,
        maxLife: 1,
        size: 0.03,
        colour: new Color(),
      });
    }
    for (let i = 0; i < MAX_SHELLS; i++) {
      this.#shells.push({
        position: new Vector3(),
        velocity: new Vector3(),
        spin: new Vector3(),
        life: 0,
        index: i,
      });
    }
  }

  /** The muzzle flash lives on the view model, not in world space. */
  attachMuzzleTo(parent: Object3D): void {
    parent.add(this.#muzzle);
  }

  #hideAll(mesh: InstancedMesh, count: number): void {
    const m = new Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, m);
    mesh.instanceMatrix.needsUpdate = true;
  }

  tracer(from: Vector3, to: Vector3, hex: number = PALETTE.ink, life = 0.055): void {
    let t = this.#tracerPool.pop();
    if (!t) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
      const line = new Line(
        geometry,
        new LineBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
      );
      line.frustumCulled = false;
      t = { line, life: 0, maxLife: life };
      this.group.add(line);
    }
    const attr = t.line.geometry.getAttribute('position') as Float32BufferAttribute;
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    (t.line.material as LineBasicMaterial).color.copy(color(hex));
    t.line.visible = true;
    t.life = life;
    t.maxLife = life;
    this.#tracers.push(t);
  }

  muzzleFlash(localPosition: Vector3): void {
    this.#muzzle.position.copy(localPosition);
    this.#muzzle.rotation.z = randRange(0, Math.PI * 2);
    this.#muzzle.scale.setScalar(randRange(0.85, 1.3));
    this.#muzzle.visible = true;
    this.#muzzleLife = 0.045;
  }

  impact(point: Vector3, normal: Vector3, surface: Surface): void {
    if (surface !== 'flesh') this.#addDecal(point, normal);

    const hex = IMPACT_COLOUR[surface];
    const count = surface === 'flesh' ? 10 : 7;
    for (let i = 0; i < count; i++) {
      const velocity = new Vector3(
        normal.x + randRange(-0.7, 0.7),
        normal.y + randRange(-0.2, 1.1),
        normal.z + randRange(-0.7, 0.7),
      ).multiplyScalar(randRange(1.4, 4.2));
      this.#addSpark(point, velocity, hex, surface === 'flesh' ? 0.06 : 0.035);
    }
  }

  #addDecal(point: Vector3, normal: Vector3): void {
    const d = this.#decalDummy;
    d.position.copy(point).addScaledVector(normal, 0.012);
    // Orient the quad to face along the surface normal, with a random roll so
    // repeated hits on one wall don't look stamped.
    d.quaternion.setFromUnitVectors(_forward.set(0, 0, 1), normal);
    d.rotateZ(randRange(0, Math.PI * 2));
    d.scale.setScalar(randRange(0.7, 1.35));
    d.updateMatrix();
    this.#decals.setMatrixAt(this.#decalCursor, d.matrix);
    this.#decals.instanceMatrix.needsUpdate = true;
    this.#decalCursor = (this.#decalCursor + 1) % MAX_DECALS;
  }

  /** Round-robin over a pre-allocated pool: the oldest spark is the one reused. */
  #addSpark(point: Vector3, velocity: Vector3, hex: number, size: number): void {
    const spark = this.#sparks[this.#sparkCursor]!;
    this.#sparkCursor = (this.#sparkCursor + 1) % MAX_SPARKS;
    const life = randRange(0.18, 0.5);
    spark.position.copy(point);
    spark.velocity.copy(velocity);
    spark.life = life;
    spark.maxLife = life;
    spark.size = size;
    spark.colour.copy(color(hex));
  }

  ejectShell(position: Vector3, velocity: Vector3): void {
    const shell = this.#shells[this.#shellCursor]!;
    this.#shellCursor = (this.#shellCursor + 1) % MAX_SHELLS;
    shell.position.copy(position);
    shell.velocity
      .copy(velocity)
      .add(new Vector3(randRange(-0.6, 0.6), randRange(0, 0.8), randRange(-0.6, 0.6)));
    shell.spin.set(randRange(-14, 14), randRange(-14, 14), randRange(-14, 14));
    shell.life = 3.2;
  }

  bloodBurst(point: Vector3, direction: Vector3): void {
    for (let i = 0; i < 14; i++) {
      const velocity = new Vector3(
        direction.x + randRange(-0.9, 0.9),
        direction.y + randRange(0.2, 1.5),
        direction.z + randRange(-0.9, 0.9),
      ).multiplyScalar(randRange(2, 5.5));
      this.#addSpark(point, velocity, PALETTE.blood, randRange(0.05, 0.09));
    }
  }

  update(dt: number): void {
    for (let i = this.#tracers.length - 1; i >= 0; i--) {
      const t = this.#tracers[i]!;
      t.life -= dt;
      const alpha = Math.max(0, t.life / t.maxLife);
      (t.line.material as LineBasicMaterial).opacity = alpha;
      if (t.life <= 0) {
        t.line.visible = false;
        this.#tracers.splice(i, 1);
        this.#tracerPool.push(t);
      }
    }

    if (this.#muzzleLife > 0) {
      this.#muzzleLife -= dt;
      if (this.#muzzleLife <= 0) this.#muzzle.visible = false;
    }

    this.#updateShells(dt);
    this.#updateSparks(dt);
  }

  #updateShells(dt: number): void {
    let dirty = false;
    for (const s of this.#shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.velocity.y -= 19 * dt;
      moveBody(this.#world, s.position, s.velocity, { radius: 0.02, height: 0.04 }, dt, 0);
      // Bleed sideways speed once it lands so casings settle rather than slide.
      s.velocity.x *= Math.exp(-3.4 * dt);
      s.velocity.z *= Math.exp(-3.4 * dt);

      const d = this.#shellDummy;
      d.position.copy(s.position);
      d.rotation.set(s.spin.x * s.life, s.spin.y * s.life, s.spin.z * s.life);
      d.scale.setScalar(s.life > 0 ? 1 : 0);
      d.updateMatrix();
      this.#shellMesh.setMatrixAt(s.index, d.matrix);
      dirty = true;

      if (s.life <= 0) {
        _zero.makeScale(0, 0, 0);
        this.#shellMesh.setMatrixAt(s.index, _zero);
      }
    }
    if (dirty) this.#shellMesh.instanceMatrix.needsUpdate = true;
  }

  #updateSparks(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.#sparks.length; i++) {
      const s = this.#sparks[i]!;
      if (s.life <= 0) continue;
      s.life -= dt;
      s.velocity.y -= 16 * dt;
      s.position.addScaledVector(s.velocity, dt);

      const d = this.#sparkDummy;
      const k = Math.max(0, s.life / s.maxLife);
      d.position.copy(s.position);
      d.scale.setScalar(s.size * (0.4 + k * 0.6));
      d.updateMatrix();
      this.#sparkMesh.setMatrixAt(i, d.matrix);
      this.#sparkMesh.setColorAt(i, s.colour);
      dirty = true;

      if (s.life <= 0) {
        _zero.makeScale(0, 0, 0);
        this.#sparkMesh.setMatrixAt(i, _zero);
      }
    }
    if (dirty) {
      this.#sparkMesh.instanceMatrix.needsUpdate = true;
      if (this.#sparkMesh.instanceColor) this.#sparkMesh.instanceColor.needsUpdate = true;
    }
  }

  clear(): void {
    for (const t of this.#tracers) {
      t.line.visible = false;
      this.#tracerPool.push(t);
    }
    this.#tracers.length = 0;
    for (const s of this.#shells) s.life = 0;
    for (const s of this.#sparks) s.life = 0;
    this.#hideAll(this.#decals, MAX_DECALS);
    this.#hideAll(this.#shellMesh, MAX_SHELLS);
    this.#hideAll(this.#sparkMesh, MAX_SPARKS);
    this.#decalCursor = 0;
  }
}

const _forward = new Vector3();
const _zero = new Matrix4();
