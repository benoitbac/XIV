import { Box3, Vector3 } from 'three';

export type Surface = 'snow' | 'wood' | 'metal' | 'concrete' | 'glass' | 'flesh';

export interface Brush {
  box: Box3;
  surface: Surface;
  /** Blocks bullets and line-of-sight. Glass panes set this false once broken. */
  solid: boolean;
  /** Blocks movement. Trigger volumes set this false. */
  blocking: boolean;
  id: number;
}

export interface RayHit {
  distance: number;
  point: Vector3;
  normal: Vector3;
  surface: Surface;
  brush: Brush | null;
}

/**
 * A broad-phase grid over the XZ plane. Levels are built from a few hundred
 * boxes; a uniform grid keeps both the character sweep and every bullet
 * raycast down to a handful of candidates without any tree-building cost.
 */
export class BrushWorld {
  readonly brushes: Brush[] = [];
  readonly #cellSize: number;
  readonly #cells = new Map<string, Brush[]>();
  #nextId = 1;

  constructor(cellSize = 8) {
    this.#cellSize = cellSize;
  }

  #key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  add(box: Box3, surface: Surface, options: { solid?: boolean; blocking?: boolean } = {}): Brush {
    const brush: Brush = {
      box,
      surface,
      solid: options.solid ?? true,
      blocking: options.blocking ?? true,
      id: this.#nextId++,
    };
    this.brushes.push(brush);

    const s = this.#cellSize;
    const x0 = Math.floor(box.min.x / s);
    const x1 = Math.floor(box.max.x / s);
    const z0 = Math.floor(box.min.z / s);
    const z1 = Math.floor(box.max.z / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = this.#key(cx, cz);
        let bucket = this.#cells.get(key);
        if (!bucket) {
          bucket = [];
          this.#cells.set(key, bucket);
        }
        bucket.push(brush);
      }
    }
    return brush;
  }

  clear(): void {
    this.brushes.length = 0;
    this.#cells.clear();
    this.#nextId = 1;
  }

  /** Fills `out` with brushes whose cells overlap `box`. Deduplicated. */
  query(box: Box3, out: Brush[]): Brush[] {
    out.length = 0;
    const s = this.#cellSize;
    const x0 = Math.floor(box.min.x / s);
    const x1 = Math.floor(box.max.x / s);
    const z0 = Math.floor(box.min.z / s);
    const z1 = Math.floor(box.max.z / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const bucket = this.#cells.get(this.#key(cx, cz));
        if (!bucket) continue;
        for (const b of bucket) {
          if (!out.includes(b)) out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Slab-test raycast. `filter` lets callers ignore non-solid brushes (bullets)
   * or trigger volumes (line of sight).
   */
  raycast(
    origin: Vector3,
    direction: Vector3,
    maxDistance: number,
    filter: (b: Brush) => boolean = (b) => b.solid,
  ): RayHit | null {
    let best: RayHit | null = null;

    for (const brush of this.brushes) {
      if (!filter(brush)) continue;

      const { min, max } = brush.box;
      let tmin = 0;
      let tmax = maxDistance;
      let hitAxis = 0;
      let hitSign = 0;

      for (let axis = 0; axis < 3; axis++) {
        const o = axis === 0 ? origin.x : axis === 1 ? origin.y : origin.z;
        const d = axis === 0 ? direction.x : axis === 1 ? direction.y : direction.z;
        const lo = axis === 0 ? min.x : axis === 1 ? min.y : min.z;
        const hi = axis === 0 ? max.x : axis === 1 ? max.y : max.z;

        if (Math.abs(d) < 1e-8) {
          if (o < lo || o > hi) {
            tmin = Infinity;
            break;
          }
          continue;
        }

        const inv = 1 / d;
        let t1 = (lo - o) * inv;
        let t2 = (hi - o) * inv;
        let sign = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          sign = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          hitAxis = axis;
          hitSign = sign;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) {
          tmin = Infinity;
          break;
        }
      }

      if (tmin === Infinity || tmin < 0 || tmin > maxDistance) continue;
      if (best && tmin >= best.distance) continue;

      const point = new Vector3().copy(direction).multiplyScalar(tmin).add(origin);
      const normal = new Vector3();
      if (hitAxis === 0) normal.x = hitSign;
      else if (hitAxis === 1) normal.y = hitSign;
      else normal.z = hitSign;

      best = { distance: tmin, point, normal, surface: brush.surface, brush };
    }

    return best;
  }

  /** True when nothing solid stands between the two points. */
  lineOfSight(from: Vector3, to: Vector3): boolean {
    const dir = _v1.copy(to).sub(from);
    const dist = dir.length();
    if (dist < 1e-4) return true;
    dir.divideScalar(dist);
    return this.raycast(from, dir, dist - 0.01) === null;
  }
}

const _v1 = new Vector3();
const _box = new Box3();
const _candidates: Brush[] = [];

export interface BodyShape {
  radius: number;
  height: number;
}

export interface MoveResult {
  grounded: boolean;
  hitWall: boolean;
  hitCeiling: boolean;
  /** Surface the body is standing on, if any. */
  ground: Surface | null;
  steppedUp: number;
}

function bodyBox(position: Vector3, shape: BodyShape, out: Box3): Box3 {
  out.min.set(position.x - shape.radius, position.y, position.z - shape.radius);
  out.max.set(position.x + shape.radius, position.y + shape.height, position.z + shape.radius);
  return out;
}

/** True when a body of `shape` placed at `position` touches nothing blocking. */
export function bodyFits(world: BrushWorld, position: Vector3, shape: BodyShape): boolean {
  bodyBox(position, shape, _box);
  world.query(_box, _candidates);
  for (const b of _candidates) {
    if (!b.blocking) continue;
    if (
      _box.min.x < b.box.max.x &&
      _box.max.x > b.box.min.x &&
      _box.min.y < b.box.max.y &&
      _box.max.y > b.box.min.y &&
      _box.min.z < b.box.max.z &&
      _box.max.z > b.box.min.z
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Quake-style move-and-slide on an axis-aligned box: each axis is displaced and
 * resolved independently, which gives clean sliding along walls without any of
 * the jitter a naive push-out produces in corners. `position` is at the body's
 * feet.
 */
export function moveBody(
  world: BrushWorld,
  position: Vector3,
  velocity: Vector3,
  shape: BodyShape,
  dt: number,
  stepHeight = 0.42,
): MoveResult {
  const result: MoveResult = {
    grounded: false,
    hitWall: false,
    hitCeiling: false,
    ground: null,
    steppedUp: 0,
  };

  const dx = velocity.x * dt;
  const dy = velocity.y * dt;
  const dz = velocity.z * dt;

  // Gather candidates once, over the whole swept extent plus a step of slack.
  bodyBox(position, shape, _box);
  _box.min.x = Math.min(_box.min.x, _box.min.x + dx) - 0.5;
  _box.max.x = Math.max(_box.max.x, _box.max.x + dx) + 0.5;
  _box.min.y = Math.min(_box.min.y, _box.min.y + dy) - stepHeight - 0.5;
  _box.max.y = Math.max(_box.max.y, _box.max.y + dy) + 0.5;
  _box.min.z = Math.min(_box.min.z, _box.min.z + dz) - 0.5;
  _box.max.z = Math.max(_box.max.z, _box.max.z + dz) + 0.5;
  world.query(_box, _candidates);
  const solids = _candidates.filter((b) => b.blocking);

  const overlaps = (): Brush | null => {
    bodyBox(position, shape, _box);
    for (const b of solids) {
      if (
        _box.min.x < b.box.max.x &&
        _box.max.x > b.box.min.x &&
        _box.min.y < b.box.max.y &&
        _box.max.y > b.box.min.y &&
        _box.min.z < b.box.max.z &&
        _box.max.z > b.box.min.z
      ) {
        return b;
      }
    }
    return null;
  };

  const sweepHorizontal = (axis: 'x' | 'z', delta: number): void => {
    if (delta === 0) return;
    const before = position[axis];
    position[axis] += delta;
    const hit = overlaps();
    if (!hit) return;

    // Try to step over it — kerbs, crates, stairs made of boxes.
    const beforeY = position.y;
    position.y += stepHeight;
    if (!overlaps()) {
      result.steppedUp = position.y - beforeY;
      return;
    }
    position.y = beforeY;

    // Blocked for real: snap flush against the face we ran into.
    position[axis] =
      delta > 0
        ? (axis === 'x' ? hit.box.min.x : hit.box.min.z) - shape.radius - 1e-3
        : (axis === 'x' ? hit.box.max.x : hit.box.max.z) + shape.radius + 1e-3;

    if (overlaps()) position[axis] = before;
    result.hitWall = true;
  };

  sweepHorizontal('x', dx);
  sweepHorizontal('z', dz);

  // Vertical last, so a step-up is settled back down onto the ground.
  position.y += dy;
  const vHit = overlaps();
  if (vHit) {
    if (dy <= 0) {
      position.y = vHit.box.max.y + 1e-3;
      result.grounded = true;
      result.ground = vHit.surface;
    } else {
      position.y = vHit.box.min.y - shape.height - 1e-3;
      result.hitCeiling = true;
    }
    velocity.y = 0;
  }

  // Ground probe: a body walking down a shallow slope of boxes must stay stuck
  // to it instead of entering a one-frame fall every step.
  if (!result.grounded && dy <= 0) {
    const probe = 0.12;
    position.y -= probe;
    const g = overlaps();
    if (g) {
      position.y = g.box.max.y + 1e-3;
      result.grounded = true;
      result.ground = g.surface;
      velocity.y = 0;
    } else {
      position.y += probe;
    }
  }

  return result;
}
