import { BoxGeometry, Mesh, Vector3 } from 'three';
import { PALETTE } from '../../render/palette.ts';
import { toon } from '../../render/toon.ts';
import { scaleBoxUVs } from '../../render/textures.ts';
import * as kit from '../kit.ts';
import type { LevelBuilder, LevelDefinition } from '../Level.ts';

/**
 * Chapter one — Le Téléphérique.
 *
 * Laid out as a corridor of rooms rather than an open field. A cel-shaded frame
 * needs edges to ink; wide empty ground gives it none, so the valley is kept
 * narrow, walled with rock, and every stretch has something built in it.
 */

const SNOW: number = PALETTE.snow;
const PLANK = PALETTE.wood;
const PLANK_DARK = PALETTE.woodDark;
const STEEL = PALETTE.steel;
const STEEL_DARK = PALETTE.steelDark;

interface Opening {
  /** Distance from the wall's centre, along the wall. */
  at: number;
  width: number;
  height: number;
  /** Height of the opening's sill above the floor. */
  sill: number;
}

/**
 * A wall with holes punched in it. Emitting the segments as separate collidable
 * boxes is what lets the player walk through a doorway and shoot through a
 * window, which a single box never could.
 */
function wallWithOpenings(
  b: LevelBuilder,
  axis: 'x' | 'z',
  centre: Vector3,
  span: number,
  height: number,
  thickness: number,
  hex: number,
  openings: Opening[],
): void {
  const sorted = [...openings].sort((a, b2) => a.at - b2.at);
  let cursor = -span / 2;

  const emit = (from: number, to: number, yFrom: number, yTo: number): void => {
    const w = to - from;
    const h = yTo - yFrom;
    if (w <= 0.01 || h <= 0.01) return;
    const mid = (from + to) / 2;
    if (axis === 'x') {
      b.box(centre.x + mid, centre.y + yFrom, centre.z, w, h, thickness, 'wood', hex);
    } else {
      b.box(centre.x, centre.y + yFrom, centre.z + mid, thickness, h, w, 'wood', hex);
    }
  };

  for (const o of sorted) {
    emit(cursor, o.at - o.width / 2, 0, height);
    if (o.sill > 0) emit(o.at - o.width / 2, o.at + o.width / 2, 0, o.sill);
    const top = o.sill + o.height;
    if (top < height) emit(o.at - o.width / 2, o.at + o.width / 2, top, height);
    cursor = o.at + o.width / 2;
  }
  emit(cursor, span / 2, 0, height);
}

/** Pitched roof built from two slabs, with an overhang and a cap of snow. */
function roof(
  b: LevelBuilder,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  rise: number,
): void {
  const overhang = 0.55;
  const w = width + overhang * 2;
  const half = depth / 2 + overhang;

  for (const side of [-1, 1]) {
    const slab = new Mesh(
      new BoxGeometry(w, 0.18, half * 1.06),
      toon(PLANK_DARK, { ramp: 'duo', texture: 'shingle' }),
    );
    scaleBoxUVs(slab.geometry as BoxGeometry, w, 0.18, half, 1.1);
    // A positive rotation.x tips a slab's +Z edge downward, so the pan sitting
    // on the +Z side needs a positive angle and the one on -Z a negative one.
    // With the sign the other way round the two pans meet in a valley instead
    // of a ridge — and it still reads as a roof from dead in front, which is
    // how it survived being looked at.
    const pitch = side * Math.atan2(rise, half);

    b.decor(slab, x, y + rise / 2, z + (side * half) / 2);
    slab.rotation.x = pitch;

    const snowCap = new Mesh(
      new BoxGeometry(w * 0.97, 0.11, half * 0.92),
      toon(SNOW, { ramp: 'snow', texture: 'snow' }),
    );
    b.decor(snowCap, x, y + rise / 2 + 0.14, z + (side * half) / 2);
    snowCap.rotation.x = pitch;
  }

  // Ridge beam.
  b.decor(
    new Mesh(new BoxGeometry(w, 0.22, 0.24), toon(PLANK_DARK, { ramp: 'duo' })),
    x,
    y + rise + 0.05,
    z,
  );

  // Gable ends. Without these the triangle between the wall top and the pitched
  // roof is simply open, and you can see daylight straight through the building.
  const steps = 6;
  for (const side of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const stepDepth = depth * (1 - t);
      const stepHeight = rise / steps;
      b.box(
        x + (side * width) / 2,
        y + i * stepHeight,
        z,
        0.26,
        stepHeight + 0.02,
        stepDepth,
        'wood',
        PLANK_DARK,
        { tile: 1.0 },
      );
    }
  }

  // Stops the player from walking onto the roof through the gap at the ridge.
  b.clip(x, y - 0.1, z, width + 0.6, 0.4, depth + 0.6);
}

/** Cold Fork ranger station: porch, office, store room, furnished. */
function rangerStation(b: LevelBuilder, x: number, y: number, z: number): void {
  const w = 11;
  const d = 8.4;
  const h = 3.2;
  const t = 0.3;

  // Foundation skirt and floor.
  b.box(x, y - 0.5, z, w + 0.5, 0.5, d + 0.5, 'concrete', PALETTE.concrete);
  b.box(x, y - 0.05, z, w, 0.05, d, 'wood', PLANK_DARK, { tile: 1.4 });

  // Front (west) wall: door plus a window.
  wallWithOpenings(b, 'z', new Vector3(x - w / 2 + t / 2, y, z), d, h, t, PLANK, [
    { at: -1.6, width: 1.3, height: 2.1, sill: 0 },
    { at: 2.1, width: 1.2, height: 1.2, sill: 1.0 },
  ]);
  // Back (east) wall: one high window.
  wallWithOpenings(b, 'z', new Vector3(x + w / 2 - t / 2, y, z), d, h, t, PLANK, [
    { at: 0.5, width: 1.2, height: 1.1, sill: 1.2 },
  ]);
  // North wall: two windows.
  wallWithOpenings(b, 'x', new Vector3(x, y, z - d / 2 + t / 2), w, h, t, PLANK, [
    { at: -2.8, width: 1.2, height: 1.2, sill: 1.0 },
    { at: 2.4, width: 1.2, height: 1.2, sill: 1.0 },
  ]);
  // South wall: solid, with the stove flue against it.
  wallWithOpenings(b, 'x', new Vector3(x, y, z + d / 2 - t / 2), w, h, t, PLANK, []);

  // Internal partition splitting office from store, with a doorway.
  wallWithOpenings(b, 'z', new Vector3(x + 1.4, y, z), d, h, 0.2, PLANK_DARK, [
    { at: -1.2, width: 1.2, height: 2.1, sill: 0 },
  ]);

  roof(b, x, y + h, z, w, d, 1.4);

  // Porch.
  b.box(x - w / 2 - 1.9, y - 0.15, z - 1.6, 3.8, 0.15, 4.2, 'wood', PLANK_DARK, { tile: 1.2 });
  for (const pz of [-3.4, 0.2]) {
    b.box(x - w / 2 - 3.6, y, z + pz, 0.16, 2.6, 0.16, 'wood', PLANK_DARK);
  }
  b.decor(
    new Mesh(new BoxGeometry(4.2, 0.16, 4.6), toon(PLANK_DARK, { ramp: 'duo', texture: 'plank' })),
    x - w / 2 - 1.9,
    y + 2.7,
    z - 1.6,
  );
  b.prop(kit.railing(4.0), x - w / 2 - 1.9, y, z - 3.6);

  // Openings get linings and joinery, or the walls read as cardboard.
  b.prop(kit.frameOpening(1.3, 2.1, t), x - w / 2 + t / 2, y, z - 1.6, Math.PI / 2);
  b.prop(kit.door(1.25, 2.05, -0.9), x - w / 2 + t / 2, y, z - 2.25, Math.PI / 2);
  b.prop(kit.windowUnit(1.2, 1.2), x - w / 2 + t / 2, y + 1.0, z + 2.1, Math.PI / 2);
  b.prop(kit.windowUnit(1.2, 1.1), x + w / 2 - t / 2, y + 1.2, z + 0.5, Math.PI / 2);
  b.prop(kit.windowUnit(1.2, 1.2), x - 2.8, y + 1.0, z - d / 2 + t / 2);
  b.prop(kit.windowUnit(1.2, 1.2), x + 2.4, y + 1.0, z - d / 2 + t / 2);
  b.prop(kit.frameOpening(1.2, 2.1, 0.2), x + 1.4, y, z - 1.2, Math.PI / 2);

  // --- Office (west half) ---------------------------------------------------
  b.prop(kit.desk(1.7), x - 2.4, y, z + 2.6, 0.1);
  b.prop(kit.chair(), x - 2.4, y, z + 1.7, 2.9);
  b.prop(kit.radioSet(), x - 3.1, y + 0.8, z + 2.6, 0.1);
  b.prop(kit.lockers(3), x - 4.4, y, z - 2.9, 0);
  b.prop(kit.shelfUnit(1.7, 4), x - 0.2, y, z + 3.6, Math.PI);
  b.prop(kit.stove(2.6), x + 0.2, y, z + 3.1, Math.PI);
  b.prop(kit.wallLamp(), x - 2.4, y + 2.5, z - 3.8, 0);
  b.prop(kit.wallLamp(), x + 3.6, y + 2.5, z + 3.6, Math.PI);
  b.prop(kit.pipeRun(6.5, 2), x - 2.2, y + 2.55, z + 4.0, 0);
  b.lamp(x - 2.4, y + 2.25, z - 3.4, { intensity: 14, distance: 12 });
  b.lamp(x + 3.6, y + 2.25, z + 3.2, { intensity: 14, distance: 12 });
  // The stove throws a low warm pool across the office floor.
  b.lamp(x + 0.2, y + 0.6, z + 2.6, { colour: 0xff9440, intensity: 6, distance: 6.5 });
  // A shaft of daylight standing in for bounce through the west windows.
  b.lamp(x - 3.4, y + 1.7, z + 1.0, { colour: 0xbcd4e8, intensity: 7, distance: 9 });

  // Desk and lockers are cover; give them collision.
  b.clip(x - 2.4, y, z + 2.6, 1.8, 0.8, 0.8);
  b.clip(x - 4.4, y, z - 2.9, 1.4, 1.9, 0.5);

  // --- Store room (east half) ----------------------------------------------
  b.prop(kit.crate(0.95), x + 3.4, y, z - 2.6, 0.3);
  b.prop(kit.crate(0.8), x + 3.4, y + 0.95, z - 2.6, -0.2);
  b.prop(kit.crate(0.9), x + 4.4, y, z - 1.4, 0.8);
  b.prop(kit.drum(true), x + 4.5, y, z + 2.9);
  b.prop(kit.drum(false), x + 3.8, y, z + 3.4);
  b.prop(kit.bunk(), x + 2.6, y, z + 1.4, Math.PI / 2);
  b.prop(kit.shelfUnit(1.4, 3), x + 4.6, y, z + 0.6, -Math.PI / 2);
  b.clip(x + 3.4, y, z - 2.6, 1.1, 1.8, 1.1);
  b.clip(x + 2.6, y, z + 1.4, 2.0, 1.7, 1.0);
}

/** Winch house: machinery room at the foot of the pylon. */
function winchHouse(b: LevelBuilder, x: number, y: number, z: number): void {
  const w = 9;
  const d = 7.5;
  const h = 3.6;
  const t = 0.3;

  b.box(x, y - 0.4, z, w + 0.6, 0.4, d + 0.6, 'concrete', PALETTE.concrete);
  b.box(x, y - 0.05, z, w, 0.05, d, 'concrete', 0x6f6a63, { tile: 2.0 });

  wallWithOpenings(b, 'z', new Vector3(x + w / 2 - t / 2, y, z), d, h, t, STEEL_DARK, [
    { at: 0.4, width: 1.6, height: 2.3, sill: 0 },
  ]);
  wallWithOpenings(b, 'z', new Vector3(x - w / 2 + t / 2, y, z), d, h, t, STEEL_DARK, [
    { at: -1.4, width: 2.0, height: 1.4, sill: 1.4 },
  ]);
  wallWithOpenings(b, 'x', new Vector3(x, y, z - d / 2 + t / 2), w, h, t, STEEL_DARK, [
    { at: 2.2, width: 1.4, height: 1.3, sill: 1.3 },
  ]);
  wallWithOpenings(b, 'x', new Vector3(x, y, z + d / 2 - t / 2), w, h, t, STEEL_DARK, []);

  // Flat industrial roof with a parapet.
  b.box(x, y + h, z, w + 0.6, 0.24, d + 0.6, 'metal', STEEL_DARK, { tile: 1.6 });
  for (const [ox, oz, sw, sd] of [
    [0, -d / 2 - 0.2, w + 0.6, 0.2],
    [0, d / 2 + 0.2, w + 0.6, 0.2],
    [-w / 2 - 0.2, 0, 0.2, d + 0.6],
    [w / 2 + 0.2, 0, 0.2, d + 0.6],
  ] as const) {
    b.box(x + ox, y + h + 0.24, z + oz, sw, 0.35, sd, 'metal', STEEL);
  }

  b.prop(kit.frameOpening(1.6, 2.3, t), x + w / 2 - t / 2, y, z + 0.4, Math.PI / 2);
  b.prop(kit.windowUnit(2.0, 1.4), x - w / 2 + t / 2, y + 1.4, z - 1.4, Math.PI / 2);
  b.prop(kit.windowUnit(1.4, 1.3), x + 2.2, y + 1.3, z - d / 2 + t / 2);

  b.prop(kit.winchDrum(), x - 1.6, y, z - 1.4, Math.PI / 2);
  b.clip(x - 1.6, y, z - 1.4, 1.4, 2.1, 2.8);

  b.prop(kit.pipeRun(8, 3), x, y + 2.6, z + d / 2 - 0.5, 0);
  b.prop(kit.pipeRun(6.5, 2), x - w / 2 + 0.5, y + 1.0, z, Math.PI / 2);
  b.prop(kit.drum(false), x + 3.0, y, z - 2.6);
  b.prop(kit.drum(true), x + 3.6, y, z - 1.9);
  b.prop(kit.crate(0.9), x + 2.6, y, z + 2.4, -0.4);
  b.prop(kit.wallLamp(), x, y + 3.0, z - d / 2 + 0.4, 0);
  b.prop(kit.wallLamp(), x - 3.0, y + 3.0, z + d / 2 - 0.4, Math.PI);
  b.prop(kit.shelfUnit(1.5, 3), x + 3.4, y, z + 0.6, -Math.PI / 2);
  b.lamp(x, y + 2.8, z - d / 2 + 0.9, { intensity: 14, distance: 12 });
  b.lamp(x - 3.0, y + 2.8, z + d / 2 - 0.9, { intensity: 14, distance: 12 });
  b.lamp(x + 3.2, y + 1.6, z + 0.4, { colour: 0xbcd4e8, intensity: 6, distance: 8 });
}

/** Lower cable station: canopy, ticket booth, benches, the waiting car. */
function lowerStation(b: LevelBuilder, x: number, y: number, z: number): void {
  const w = 14;
  const d = 10;

  b.box(x, y - 0.35, z, w, 0.35, d, 'concrete', PALETTE.concrete, { tile: 2.2 });
  b.box(x, y, z + d / 2 - 0.4, w, 0.35, 0.8, 'metal', STEEL, { tile: 1.2 });

  // Canopy on eight posts.
  for (const px of [-w / 2 + 0.8, -2.4, 2.4, w / 2 - 0.8]) {
    for (const pz of [-d / 2 + 0.8, d / 2 - 0.8]) {
      b.box(x + px, y, z + pz, 0.3, 4.2, 0.3, 'metal', STEEL_DARK);
      b.decor(
        new Mesh(
          new BoxGeometry(0.7, 0.7, 0.1),
          toon(STEEL_DARK, { ramp: 'duo', texture: 'metal' }),
        ),
        x + px,
        y + 3.9,
        z + pz,
      );
    }
  }
  b.box(x, y + 4.2, z, w + 1.4, 0.26, d + 1.4, 'metal', STEEL_DARK, { tile: 1.8 });
  b.box(x, y + 4.46, z, w + 1.2, 0.12, d + 1.2, 'snow', SNOW, { tile: 1.6, castShadow: false });

  // Ticket booth: a small glazed box on the platform.
  const bx = x - 4.6;
  const bz = z + 3.2;
  b.box(bx, y, bz, 2.6, 2.6, 2.2, 'wood', PLANK);
  b.box(bx, y + 2.6, bz, 3.0, 0.2, 2.6, 'wood', PLANK_DARK);
  b.decor(
    new Mesh(
      new BoxGeometry(1.9, 1.0, 0.05),
      toon(0x9fc4d6, { ramp: 'flat', transparent: true, opacity: 0.35 }),
    ),
    bx,
    y + 1.6,
    bz - 1.12,
  );
  b.prop(kit.windowUnit(1.9, 1.0), bx, y + 1.1, bz - 1.1);
  b.prop(kit.sign('COLD FORK', 2.4, 1.0), bx, y + 2.9, bz - 1.2);

  b.prop(kit.railing(9), x, y, z - d / 2 + 0.5);
  b.prop(kit.railing(6), x + w / 2 - 0.5, y, z, Math.PI / 2);

  for (const bench of [-1.5, 1.5]) {
    b.box(x + bench * 2.2, y, z - 2.6, 1.8, 0.45, 0.5, 'wood', PLANK_DARK, { tile: 0.8 });
    b.decor(
      new Mesh(new BoxGeometry(1.8, 0.5, 0.1), toon(PLANK_DARK, { ramp: 'duo', texture: 'plank' })),
      x + bench * 2.2,
      y + 0.68,
      z - 2.85,
    );
  }

  b.prop(kit.wallLamp(), x - 2.4, y + 3.8, z - d / 2 + 0.9, 0);
  b.prop(kit.wallLamp(), x + 2.4, y + 3.8, z - d / 2 + 0.9, 0);
  b.lamp(x - 2.4, y + 3.6, z - d / 2 + 1.4, { intensity: 16, distance: 13 });
  b.lamp(x + 2.4, y + 3.6, z - d / 2 + 1.4, { intensity: 16, distance: 13 });
  b.lamp(x - 4.6, y + 1.8, z + 2.0, { colour: 0xffd9a0, intensity: 7, distance: 7 });
  b.prop(kit.drum(true), x + 5.2, y, z + 3.6);
  b.prop(kit.crate(0.85), x + 4.4, y, z + 3.9, 0.5);
}

export const LEVEL_01: LevelDefinition = {
  id: 'level01',
  title: 'Le Téléphérique',
  subtitle: 'Cascades — Cold Fork',
  windIntensity: 0.75,
  sky: {
    // Late afternoon, sun low over the ridge to the west: long shadows across
    // the snow, and a sky dark enough at the zenith to give the horizon a line.
    top: 0x5d84ab,
    bottom: 0xcfdce8,
    bands: 6,
    fogColor: 0xa9bccf,
    fogNear: 45,
    fogFar: 200,
    sunDirection: new Vector3(-0.66, 0.46, 0.38),
    sunIntensity: 1.4,
    ambientIntensity: 0.15,
  },
  // Facing the tear in the shell, downhill — the first thing you see is the way out.
  spawn: { position: new Vector3(0, 14.2, 46.2), yaw: 0 },

  build(b: LevelBuilder): void {
    // ---------------------------------------------------------------------
    // Terrain — three shelves, kept narrow. A wide field gives the ink pass
    // nothing to draw; a walled corridor keeps geometry in every frame.
    // ---------------------------------------------------------------------
    // Heights are given as (low end at -Z, high end at +Z): the player descends
    // from the crash bowl at +Z down to the station in the valley at -Z.
    b.box(0, 10, 42, 30, 4, 24, 'snow', SNOW, { tile: 3.2 }); // crash bowl, y = 14
    // Many shallow treads, not few deep ones: at a dozen steps a hillside reads
    // as a monumental staircase. Under ~20 cm of rise the ink pass turns the
    // step edges into fine hatching, which is exactly what a drawn slope wants.
    b.slope(0, 24, 16, 12, 8, 14, 34, 'snow', SNOW);
    b.box(0, 4, 8, 38, 4, 24, 'snow', SNOW, { tile: 3.2 }); // tree line, y = 8
    b.slope(0, -3, 18, 10, 4, 8, 26, 'snow', SNOW);
    b.box(0, 0, -34, 56, 4, 56, 'snow', SNOW, { tile: 3.2 }); // valley floor, y = 4

    // Valley walls. The visible rock is decorative geometry with real internal
    // edges; a plain clip box behind it does the actual containing, so the
    // player never snags on a rotated slab.
    for (let i = 0; i < 11; i++) {
      const z = 50 - i * 10;
      const y = z > 28 ? 14 : z > 0 ? 8 : 4;
      const inset = z > 28 ? 15 : z > 0 ? 19 : 26;
      for (const side of [-1, 1]) {
        const x = side * inset;
        b.prop(
          kit.cliff(11, 14 + b.random() * 10, i * 13 + (side > 0 ? 1 : 2)),
          x,
          y - 1,
          z,
          side > 0 ? Math.PI : 0,
        );
        b.clip(side * (inset + 2.4), y, z, 6, 26, 11);
      }
    }
    b.clip(0, 4, 58, 60, 30, 6);
    b.clip(0, 4, -64, 60, 30, 6);

    // Distant ridges: the cheapest depth you can buy in a snow level. They sit
    // outside the fog's far plane, so they read as haze rather than as geometry,
    // and they never enter the shadow map.
    // Kept inside the camera's far plane (400 m) so the second, hazier ring is
    // not clipped away — a single ring reads as cardboard cut-outs.
    b.prop(kit.mountainRange(230, 5), 0, 10, 0, 0, { shadows: false });

    // ---------------------------------------------------------------------
    // Act 1 — the wreck.
    // ---------------------------------------------------------------------
    // The wreck opens downhill, so the first thing the player sees is the way
    // out and the first thing they do is walk through it.
    const wreck = kit.gondola(0x9d3a2f, true);
    b.prop(wreck, 0, 13.9, 45.4, 0.14);
    wreck.rotation.z = 0.13;
    // Cabin shell: collision only, since the prop itself is decor.
    b.clip(-1.4, 14, 45.4, 0.4, 2.3, 3);
    b.clip(1.4, 14, 45.4, 0.4, 2.3, 3);
    b.clip(0, 14, 46.8, 3.2, 2.3, 0.4);
    b.clip(0, 16.1, 45.4, 3.2, 0.4, 3.2);

    b.prop(kit.rockCluster(1.6, 3), -6.5, 14, 41);
    b.prop(kit.rockCluster(1.3, 4), 7, 14, 38);
    b.prop(kit.drift(5, 2.4, 1.1), -4, 14, 48, 0.4);
    b.prop(kit.drift(4, 2.0, 0.9), 5, 14, 47.5, -0.6);

    // The severed cable, dragged downhill.
    const cable = toon(PALETTE.ink, { ramp: 'flat' });
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const seg = new Mesh(new BoxGeometry(0.1, 0.1, 2.2), cable);
      seg.rotation.y = Math.sin(i * 1.7) * 0.14;
      seg.rotation.z = Math.cos(i * 2.1) * 0.1;
      b.decor(seg, Math.sin(i * 0.8) * 3.2, 14.1 - t * 0.15, 41 - i * 1.35);
    }
    // Debris field.
    for (let i = 0; i < 9; i++) {
      const piece = new Mesh(
        new BoxGeometry(0.4 + b.random() * 0.9, 0.12, 0.5 + b.random() * 0.8),
        toon(0x9d3a2f, { ramp: 'duo', texture: 'metal' }),
      );
      piece.rotation.set(b.random() * 0.4, b.random() * Math.PI, b.random() * 0.4);
      b.decor(piece, -7 + b.random() * 14, 14.08, 34 + b.random() * 12);
    }

    b.trigger('wake', new Vector3(0, 15, 45), new Vector3(4, 3, 6), true);
    b.trigger('out-of-car', new Vector3(0, 15, 41), new Vector3(8, 4, 4), true);
    b.pickup(
      { type: 'document', id: 'd03-manifeste' },
      new Vector3(-1.5, 14.4, 47.2),
      'Plaque de la cabine',
    );

    // ---------------------------------------------------------------------
    // Act 2 — the ravine: the pilot, the Colt, the first memory.
    // ---------------------------------------------------------------------
    b.prop(kit.telegraphPole(7.5), -8, 14, 33);
    b.prop(kit.snowFence(9), 9, 14, 32, 0.1);
    b.prop(kit.rockCluster(1.4, 9), 8, 14, 28);
    b.prop(kit.drift(6, 2.6, 1.2), -9, 14, 30, 0.2);

    // The pilot: a fallen figure marked by his coat and scattered kit.
    b.decor(
      new Mesh(new BoxGeometry(0.55, 0.3, 1.7), toon(0x3d4650, { ramp: 'trio' })),
      6.4,
      14.1,
      31,
    );
    b.decor(
      new Mesh(new BoxGeometry(0.28, 0.26, 0.28), toon(0xd9a877, { ramp: 'trio' })),
      6.4,
      14.2,
      30.05,
    );
    b.prop(kit.crate(0.6), 8.0, 14, 29.6, 0.6);

    b.pickup(
      { type: 'weapon', weapon: 'colt', magazines: 2 },
      new Vector3(7.2, 14.25, 31),
      'Colt M1911',
    );
    b.pickup({ type: 'memory', id: 'm01-mains' }, new Vector3(6.1, 14.45, 30.2), 'Souvenir');
    b.pickup(
      { type: 'document', id: 'd01-saturne' },
      new Vector3(8.4, 14.25, 30.4),
      'Feuillet carbonisé',
    );
    b.trigger('first-body', new Vector3(7.4, 15, 31), new Vector3(7, 4, 7), true);
    b.trigger('descend', new Vector3(0, 12, 24), new Vector3(16, 8, 6), true);

    b.prop(kit.sign('COLD FORK  2 KM', 2.6, 2.6), -5, 12.5, 25, 0.3);

    // ---------------------------------------------------------------------
    // Act 3 — the tree line. First contact.
    // ---------------------------------------------------------------------
    const trees: Array<[number, number, number, number]> = [
      [-14, 14, 1.0, 0],
      [-11, 6, 1.15, 1],
      [-16, -2, 0.9, 2],
      [-8, -9, 1.2, 0],
      [-13, -16, 1.0, 1],
      [11, 12, 1.1, 2],
      [15, 4, 0.95, 0],
      [9, -4, 1.15, 1],
      [17, -12, 1.0, 2],
      [7, -18, 0.9, 0],
      [-19, 10, 0.85, 1],
      [19, 16, 0.9, 2],
      [-6, -24, 1.1, 0],
      [4, -28, 1.0, 1],
      [-20, -34, 1.05, 2],
      [20, -30, 0.95, 0],
      [-11, -42, 1.0, 1],
      [13, -40, 1.1, 2],
      [-23, -20, 0.9, 0],
      [23, -22, 1.0, 1],
      [-24, -48, 0.95, 2],
      [22, -50, 1.05, 0],
      [-17, -8, 1.0, 1],
      [16, -44, 0.9, 2],
    ];
    for (const [tx, tz, s, variant] of trees) {
      const groundY = tz > 20 ? 14 : tz > -4 ? 8 : 4;
      b.prop(kit.pine(s, variant), tx, groundY, tz, b.random() * Math.PI);
      // Trunks block movement; canopies do not.
      b.clip(tx, groundY, tz, 0.5 * s, 2.2 * s, 0.5 * s);
    }

    b.prop(kit.snowFence(12), -6, 8, 14, 0.05);
    b.prop(kit.telegraphPole(7), 12, 8, 8);
    b.prop(kit.telegraphPole(7), 14, 4, -12);
    b.prop(kit.rockCluster(1.5, 21), -12, 8, 4);
    b.prop(kit.drift(7, 3, 1.3), 16, 8, 6, -0.3);

    b.enemy(
      'ranger',
      new Vector3(-4, 8, 6),
      Math.PI,
      [new Vector3(-10, 8, 4), new Vector3(8, 8, 10), new Vector3(-2, 8, 14)],
      'slope',
    );
    b.enemy(
      'ranger',
      new Vector3(12, 8, 2),
      Math.PI * 1.2,
      [new Vector3(14, 8, 8), new Vector3(5, 8, -2)],
      'slope',
    );
    b.trigger('first-guard', new Vector3(0, 10, 16), new Vector3(24, 6, 6), true);

    b.pickup({ type: 'memory', id: 'm03-quai' }, new Vector3(-12, 8.5, 12), 'Souvenir');
    b.pickup({ type: 'health', amount: 35 }, new Vector3(-16, 8.3, 6), 'Trousse de secours');

    // ---------------------------------------------------------------------
    // Act 4 — Cold Fork ranger station.
    // ---------------------------------------------------------------------
    rangerStation(b, 15, 4, -18);
    b.prop(kit.logPile(2.6, 4), 9.5, 4, -24, 0.2);
    b.prop(kit.drum(false), 8.6, 4, -12.4);
    b.prop(kit.drum(true), 9.4, 4, -11.7);
    b.prop(kit.snowFence(10), 6, 4, -8, Math.PI / 2);
    b.prop(kit.drift(6, 2.6, 1.2), 21.5, 4, -14, Math.PI / 2);
    b.prop(kit.sign('POSTE FORESTIER', 2.6, 2.8), 7.5, 4, -16, 1.3);
    b.prop(kit.telegraphPole(7), 6.5, 4, -26);

    b.pickup(
      { type: 'weapon', weapon: 'smg', magazines: 3 },
      new Vector3(12.6, 4.9, -15.4),
      'MP-Kestrel',
    );
    b.pickup(
      { type: 'document', id: 'd02-carnet' },
      new Vector3(12.6, 4.9, -16.0),
      'Carnet de poste',
    );
    b.pickup({ type: 'armour', amount: 60 }, new Vector3(10.6, 4.25, -20.9), 'Gilet pare-balles');
    b.pickup(
      { type: 'ammo', weapon: 'colt', rounds: 21 },
      new Vector3(18.4, 4.25, -20.6),
      'Munitions .45',
    );

    b.trigger('station', new Vector3(8, 6, -19.6), new Vector3(6, 5, 6), true);

    b.enemy('trooper', new Vector3(18, 4, -15), Math.PI * 0.5, [], 'station');
    b.enemy(
      'trooper',
      new Vector3(6, 4, -22),
      -Math.PI / 2,
      [new Vector3(5, 4, -12), new Vector3(5, 4, -28), new Vector3(12, 4, -28)],
      'station',
    );
    b.enemy(
      'ranger',
      new Vector3(21, 4, -26),
      0,
      [new Vector3(21, 4, -26), new Vector3(21, 4, -10)],
      'station',
    );

    // ---------------------------------------------------------------------
    // Act 5 — the winch house and the pylon.
    // ---------------------------------------------------------------------
    b.prop(kit.pylon(12), -15, 4, -26);
    b.clip(-15, 4, -26, 2.6, 8, 2.6);
    winchHouse(b, -17, 4, -37);
    b.prop(kit.sign('DANGER — TREUIL', 2.4, 2.6), -10.5, 4, -34, -1.2);
    b.prop(kit.logPile(2.2, 3), -22.5, 4, -30, 1.2);
    b.prop(kit.drift(6, 2.8, 1.3), -22.5, 4, -41, 0.3);
    b.prop(kit.snowFence(8), -9, 4, -30, Math.PI / 2);

    // The breaker the whole chapter turns on.
    b.prop(kit.breakerBox(false), -12.6, 5.0, -35.6, -Math.PI / 2);

    b.pickup(
      { type: 'weapon', weapon: 'rifle', magazines: 2 },
      new Vector3(-19.5, 4.9, -34.4),
      'Winchester 70',
    );
    b.pickup({ type: 'memory', id: 'm04-lunette' }, new Vector3(-19.5, 5.2, -35.0), 'Souvenir');
    b.pickup({ type: 'health', amount: 35 }, new Vector3(-14.0, 4.25, -39.4), 'Trousse de secours');
    b.pickup(
      { type: 'ammo', weapon: 'smg', rounds: 90 },
      new Vector3(-13.6, 4.25, -33.2),
      'Munitions 9 mm',
    );

    b.trigger('winch-room', new Vector3(-12.2, 6, -36.6), new Vector3(5, 5, 6), true);
    b.interactable('power', new Vector3(-12.6, 5, -35.6), 'Réenclencher le disjoncteur', {
      radius: 2.2,
    });

    b.enemy(
      'trooper',
      new Vector3(-10, 4, -30),
      Math.PI,
      [new Vector3(-10, 4, -22), new Vector3(-10, 4, -40)],
      'winch',
    );
    b.enemy('trooper', new Vector3(-21, 4, -30), Math.PI * 0.25, [], 'winch');
    b.enemy('sentinel', new Vector3(-17, 4, -43), 0, [], 'winch');

    // ---------------------------------------------------------------------
    // Act 6 — the lower station. Exit.
    // ---------------------------------------------------------------------
    lowerStation(b, 0, 4, -54);
    const car = kit.gondola(0x9d3a2f, false);
    b.prop(car, 0, 4.35, -50.5, Math.PI);
    b.clip(-1.35, 4.35, -50.5, 0.4, 2.4, 3);
    b.clip(1.35, 4.35, -50.5, 0.4, 2.4, 3);
    b.clip(0, 4.35, -51.9, 3, 2.4, 0.4);
    b.prop(kit.telegraphPole(7), -12, 4, -48);
    b.prop(kit.rockCluster(1.8, 33), 24, 4, -52);
    b.prop(kit.rockCluster(1.6, 34), -26, 4, -50);

    b.trigger('exfil', new Vector3(0, 6, -46), new Vector3(16, 5, 6), true);
    b.interactable('board', new Vector3(0, 5, -50.5), 'Monter dans la cabine', {
      radius: 2.8,
      enabled: false,
    });

    b.pickup({ type: 'memory', id: 'm05-rossiter' }, new Vector3(4.4, 4.6, -56.4), 'Souvenir');
    b.pickup(
      { type: 'ammo', weapon: 'rifle', rounds: 15 },
      new Vector3(-4.4, 4.6, -56.4),
      'Munitions .30-06',
    );

    b.enemy(
      'trooper',
      new Vector3(-6, 4, -46),
      Math.PI,
      [new Vector3(-6, 4, -46), new Vector3(8, 4, -44)],
      'exfil',
    );
    b.enemy('sentinel', new Vector3(7, 4, -48), Math.PI * 1.1, [], 'exfil');
  },
};
