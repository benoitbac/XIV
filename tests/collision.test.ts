import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { BrushWorld, bodyFits, moveBody } from '../src/world/Collision.ts';

const box = (
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): Box3 => new Box3(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ));

/** A 40×40 floor at y ≤ 0, so bodies start standing on solid ground. */
function floorWorld(): BrushWorld {
  const world = new BrushWorld();
  world.add(box(-20, -1, -20, 20, 0, 20), 'snow');
  return world;
}

describe('BrushWorld.raycast', () => {
  it('hits the nearest brush and reports the face normal', () => {
    const world = floorWorld();
    world.add(box(4, 0, -1, 5, 3, 1), 'concrete');
    world.add(box(9, 0, -1, 10, 3, 1), 'metal');

    const hit = world.raycast(new Vector3(0, 1, 0), new Vector3(1, 0, 0), 20);

    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(4, 5);
    expect(hit!.surface).toBe('concrete');
    // The ray enters through the -X face, so the normal points back at it.
    expect(hit!.normal.x).toBeCloseTo(-1, 5);
  });

  it('returns null past maxDistance rather than reporting a far hit', () => {
    const world = floorWorld();
    world.add(box(30, 0, -1, 31, 3, 1), 'concrete');
    expect(world.raycast(new Vector3(0, 1, 0), new Vector3(1, 0, 0), 10)).toBeNull();
  });

  it('ignores brushes the filter rejects', () => {
    const world = floorWorld();
    world.add(box(4, 0, -1, 5, 3, 1), 'glass', { solid: false });
    expect(world.raycast(new Vector3(0, 1, 0), new Vector3(1, 0, 0), 20)).toBeNull();
  });

  it('reports no line of sight through a wall, and sight around it', () => {
    const world = floorWorld();
    world.add(box(-1, 0, 4, 1, 4, 5), 'concrete');
    expect(world.lineOfSight(new Vector3(0, 1.5, 0), new Vector3(0, 1.5, 10))).toBe(false);
    expect(world.lineOfSight(new Vector3(6, 1.5, 0), new Vector3(6, 1.5, 10))).toBe(true);
  });
});

describe('moveBody', () => {
  const shape = { radius: 0.34, height: 1.8 };

  it('lands on the floor and reports the surface it stands on', () => {
    const world = floorWorld();
    const position = new Vector3(0, 3, 0);
    const velocity = new Vector3(0, -10, 0);

    const result = moveBody(world, position, velocity, shape, 0.5);

    expect(result.grounded).toBe(true);
    expect(result.ground).toBe('snow');
    expect(position.y).toBeCloseTo(0, 2);
    expect(velocity.y).toBe(0);
  });

  it('slides along a wall instead of stopping dead against it', () => {
    const world = floorWorld();
    world.add(box(2, 0, -10, 3, 3, 10), 'concrete');

    const position = new Vector3(0, 0, 0);
    const velocity = new Vector3(6, 0, 6);
    moveBody(world, position, velocity, shape, 0.2);

    // Blocked on X by the wall, but the Z component still carries.
    expect(position.x).toBeLessThan(2);
    expect(position.z).toBeGreaterThan(1);
  });

  it('steps up onto a low kerb but is stopped by a tall one', () => {
    /** Walks +X for half a second under gravity and reports where it ends up. */
    const walkInto = (obstacleHeight: number): Vector3 => {
      const world = floorWorld();
      world.add(box(1, 0, -5, 4, obstacleHeight, 5), 'wood');
      const position = new Vector3(0, 0, 0);
      const velocity = new Vector3(0, 0, 0);
      for (let i = 0; i < 30; i++) {
        velocity.x = 5;
        velocity.y -= 21 / 60;
        moveBody(world, position, velocity, shape, 1 / 60);
      }
      return position;
    };

    const overKerb = walkInto(0.3);
    expect(overKerb.x).toBeGreaterThan(2);
    expect(overKerb.y).toBeCloseTo(0.3, 2);

    const atWall = walkInto(2.5);
    // Stopped flush against the face, a body radius short of it.
    expect(atWall.x).toBeLessThanOrEqual(1 - shape.radius + 1e-3);
    expect(atWall.y).toBeCloseTo(0, 2);
  });

  it('stays glued to the ground when walking, instead of falling every frame', () => {
    const world = floorWorld();
    const position = new Vector3(0, 0, 0);
    const velocity = new Vector3(4, 0, 0);

    for (let i = 0; i < 20; i++) {
      velocity.y -= 21 * (1 / 60);
      const result = moveBody(world, position, velocity, shape, 1 / 60);
      expect(result.grounded).toBe(true);
    }
    expect(position.y).toBeCloseTo(0, 2);
  });
});

describe('bodyFits', () => {
  it('refuses a standing body under a low ceiling and accepts a crouched one', () => {
    const world = floorWorld();
    world.add(box(-2, 1.3, -2, 2, 2.5, 2), 'concrete'); // overhead slab

    const at = new Vector3(0, 0, 0);
    expect(bodyFits(world, at, { radius: 0.32, height: 1.8 })).toBe(false);
    expect(bodyFits(world, at, { radius: 0.32, height: 1.15 })).toBe(true);
  });
});
