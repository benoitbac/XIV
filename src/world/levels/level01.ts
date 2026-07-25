import { BoxGeometry, CylinderGeometry, Mesh, Vector3 } from 'three';
import { PALETTE } from '../../render/palette.ts';
import { toon } from '../../render/toon.ts';
import type { LevelBuilder, LevelDefinition } from '../Level.ts';

const SNOW: number = PALETTE.snow;
const ROCK = 0x6f7681;
const PLANK = PALETTE.wood;
const PLANK_DARK = PALETTE.woodDark;
const STEEL = PALETTE.steel;

/** Four walls, a floor and a roof, with a doorway punched in one side. */
function shed(
  b: LevelBuilder,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  doorSide: 'north' | 'south' | 'east' | 'west',
  doorWidth = 1.6,
): void {
  const t = 0.28;
  b.box(x, y - 0.15, z, width, 0.15, depth, 'wood', PLANK_DARK);

  const wall = (
    wx: number,
    wz: number,
    ww: number,
    wd: number,
    side: 'north' | 'south' | 'east' | 'west',
  ): void => {
    if (side !== doorSide) {
      b.box(wx, y, wz, ww, height, wd, 'wood', PLANK);
      return;
    }
    // Split the wall around the doorway and cap it with a lintel.
    const horizontal = side === 'north' || side === 'south';
    const span = horizontal ? ww : wd;
    const segment = (span - doorWidth) / 2;
    for (const sign of [-1, 1]) {
      const offset = (doorWidth / 2 + segment / 2) * sign;
      b.box(
        wx + (horizontal ? offset : 0),
        y,
        wz + (horizontal ? 0 : offset),
        horizontal ? segment : ww,
        height,
        horizontal ? wd : segment,
        'wood',
        PLANK,
      );
    }
    b.box(wx, y + 2.1, wz, ww, height - 2.1, wd, 'wood', PLANK);
  };

  wall(x, z - depth / 2 + t / 2, width, t, 'north');
  wall(x, z + depth / 2 - t / 2, width, t, 'south');
  wall(x - width / 2 + t / 2, z, t, depth, 'west');
  wall(x + width / 2 - t / 2, z, t, depth, 'east');

  b.box(x, y + height, z, width + 0.5, 0.22, depth + 0.5, 'wood', PLANK_DARK);
}

/** A lattice pylon: four legs, cross-bracing and the cable head on top. */
function pylon(b: LevelBuilder, x: number, z: number, groundY: number, height: number): void {
  const steel = toon(STEEL, { ramp: 'trio' });
  for (const [ox, oz] of [
    [-0.9, -0.9],
    [0.9, -0.9],
    [-0.9, 0.9],
    [0.9, 0.9],
  ] as const) {
    b.box(x + ox, groundY, z + oz, 0.24, height, 0.24, 'metal', STEEL);
  }
  for (let i = 1; i < 4; i++) {
    const y = groundY + (height / 4) * i;
    const brace = new Mesh(new BoxGeometry(2.1, 0.12, 0.12), steel);
    b.decor(brace, x, y, z - 0.9);
    const brace2 = new Mesh(new BoxGeometry(2.1, 0.12, 0.12), steel);
    b.decor(brace2, x, y, z + 0.9);
    const brace3 = new Mesh(new BoxGeometry(0.12, 0.12, 2.1), steel);
    b.decor(brace3, x - 0.9, y, z);
  }
  b.box(x, groundY + height, z, 3.4, 0.35, 0.7, 'metal', PALETTE.steelDark);
  const wheel = new Mesh(new CylinderGeometry(0.4, 0.4, 0.18, 12), steel);
  wheel.rotation.z = Math.PI / 2;
  b.decor(wheel, x, groundY + height + 0.4, z);
}

/** The wreck the game opens inside: a torn shell half-buried in the drift. */
function wreckedCar(b: LevelBuilder, x: number, y: number, z: number): void {
  const shell = 0xb5443a;
  b.box(x, y - 0.2, z, 4.4, 0.2, 6.2, 'metal', PALETTE.steelDark); // floor
  b.box(x - 2.1, y, z, 0.22, 2.5, 6.2, 'metal', shell); // west wall
  b.box(x + 2.1, y, z + 1.6, 0.22, 2.5, 3, 'metal', shell); // east wall, torn open
  b.box(x, y, z + 3.1, 4.4, 2.5, 0.22, 'metal', shell); // uphill end
  b.box(x, y + 2.5, z, 4.6, 0.24, 6.4, 'metal', PALETTE.steelDark); // roof

  // The tear the player climbs out of: a jagged lip, not a clean doorway.
  b.box(x + 1.4, y, z - 2.4, 1.6, 0.9, 0.22, 'metal', shell);
  b.box(x - 1.5, y, z - 2.4, 1.4, 2.5, 0.22, 'metal', shell);

  const bench = toon(0x3d4650, { ramp: 'trio' });
  b.decor(new Mesh(new BoxGeometry(4, 0.16, 0.5), bench), x, y + 0.55, z + 2.3);
  b.decor(new Mesh(new BoxGeometry(0.5, 0.16, 3), bench), x - 1.7, y + 0.55, z + 0.4);

  const hanger = toon(PALETTE.steel, { ramp: 'duo' });
  b.decor(new Mesh(new BoxGeometry(0.3, 1.8, 0.3), hanger), x, y + 3.4, z + 2);
}

export const LEVEL_01: LevelDefinition = {
  id: 'level01',
  title: 'Le Téléphérique',
  subtitle: 'Cascades — Cold Fork',
  windIntensity: 0.75,
  sky: {
    top: 0x8fb0cc,
    bottom: 0xe8e1d4,
    bands: 5,
    fogColor: 0xc6d2df,
    fogNear: 26,
    fogFar: 145,
    sunDirection: new Vector3(-0.42, 0.78, 0.46),
    sunIntensity: 2.15,
    ambientIntensity: 0.62,
  },
  // Facing the tear in the shell, downhill — the first thing you see is the way out.
  spawn: { position: new Vector3(0, 14.3, 46), yaw: 0 },

  build(b: LevelBuilder): void {
    // ---------------------------------------------------------------------
    // Terrain: three flat shelves joined by stepped slopes. Flat shelves keep
    // the firefights readable; the slopes do the work of "you are descending
    // a mountain".
    // ---------------------------------------------------------------------
    b.box(0, 10, 40, 60, 4, 28, 'snow', SNOW); // upper bowl, y = 14
    b.slope(0, 22, 26, 12, 14, 8, 10, 'snow', SNOW);
    b.box(0, 4, 8, 70, 4, 20, 'snow', SNOW); // middle shelf, y = 8
    b.slope(0, -1, 24, 10, 8, 4, 8, 'snow', SNOW);
    b.box(0, 0, -30, 84, 4, 50, 'snow', SNOW); // lower shelf, y = 4

    // Rock walls bounding the valley.
    for (let i = 0; i < 14; i++) {
      const z = 52 - i * 7;
      const h = 9 + b.random() * 7;
      b.box(-34 - b.random() * 2, 2, z, 8, h, 8, 'concrete', ROCK, { ramp: 'trio' });
      b.box(34 + b.random() * 2, 2, z, 8, h, 8, 'concrete', ROCK, { ramp: 'trio' });
    }
    b.clip(0, 4, 58, 90, 24, 6);
    b.clip(0, 4, -58, 90, 24, 6);

    // ---------------------------------------------------------------------
    // Act 1 — the wreck.
    // ---------------------------------------------------------------------
    wreckedCar(b, 0, 14, 45);
    b.rock(-6, 41, 14, 1.6);
    b.rock(7, 38, 14, 1.2);

    // The severed cable, dragged downhill in the snow.
    const cable = toon(PALETTE.ink, { ramp: 'flat' });
    for (let i = 0; i < 22; i++) {
      const t = i / 21;
      const seg = new Mesh(new BoxGeometry(0.09, 0.09, 2.4), cable);
      seg.rotation.y = Math.sin(i * 1.7) * 0.12;
      b.decor(seg, Math.sin(i * 0.8) * 3.4, 14.1 - t * 0.2, 40 - i * 1.4);
    }

    b.trigger('wake', new Vector3(0, 15, 45), new Vector3(4, 3, 6), true);
    b.trigger('out-of-car', new Vector3(0, 15, 40), new Vector3(6, 4, 4), true);

    b.pickup(
      { type: 'document', id: 'd03-manifeste' },
      new Vector3(-1.6, 14.35, 47.6),
      'Plaque de la cabine',
    );

    // ---------------------------------------------------------------------
    // Act 2 — the pilot's body, the Colt, the first memory.
    // ---------------------------------------------------------------------
    b.rock(9, 30, 14, 1.4);
    b.pickup(
      { type: 'weapon', weapon: 'colt', magazines: 2 },
      new Vector3(7.2, 14.2, 31),
      'Colt M1911',
    );
    b.pickup({ type: 'memory', id: 'm01-mains' }, new Vector3(6.2, 14.4, 30.2), 'Souvenir');
    b.pickup(
      { type: 'document', id: 'd01-saturne' },
      new Vector3(8.4, 14.2, 30.4),
      'Feuillet carbonisé',
    );
    b.trigger('first-body', new Vector3(7.4, 15, 31), new Vector3(7, 4, 7), true);
    b.trigger('descend', new Vector3(0, 12, 24), new Vector3(24, 8, 6), true);

    // ---------------------------------------------------------------------
    // Act 3 — the tree line. First contact.
    // ---------------------------------------------------------------------
    const treeSeeds: Array<[number, number, number]> = [
      [-18, 14, 1],
      [-13, 6, 1.1],
      [-21, -2, 0.9],
      [-9, -9, 1.2],
      [-16, -16, 1],
      [13, 12, 1.1],
      [19, 4, 0.95],
      [11, -4, 1.15],
      [22, -12, 1],
      [8, -18, 0.9],
      [-25, 10, 0.85],
      [26, 16, 0.9],
      [-6, -24, 1.1],
      [4, -30, 1],
      [-24, -34, 1.05],
      [24, -30, 0.95],
      [-12, -42, 1],
      [15, -40, 1.1],
      [-28, -20, 0.9],
      [29, -22, 1],
    ];
    for (const [x, z, s] of treeSeeds) {
      const groundY = z > 18 ? 14 : z > -2 ? 8 : 4;
      b.pine(x, z, groundY, s);
    }
    for (let i = 0; i < 10; i++) {
      const x = -30 + b.random() * 60;
      const z = -46 + b.random() * 30;
      b.rock(x, z, 4, 0.7 + b.random() * 0.8);
    }

    b.enemy(
      'ranger',
      new Vector3(-4, 8, 6),
      Math.PI,
      [new Vector3(-12, 8, 4), new Vector3(10, 8, 10), new Vector3(-2, 8, 14)],
      'slope',
    );
    b.enemy(
      'ranger',
      new Vector3(14, 8, 2),
      Math.PI * 1.2,
      [new Vector3(18, 8, 8), new Vector3(6, 8, -2)],
      'slope',
    );
    b.trigger('first-guard', new Vector3(0, 10, 16), new Vector3(28, 6, 6), true);

    b.pickup({ type: 'memory', id: 'm03-quai' }, new Vector3(-14, 8.4, 12), 'Souvenir');
    b.pickup({ type: 'health', amount: 35 }, new Vector3(-20, 8.2, 6), 'Trousse de secours');

    // ---------------------------------------------------------------------
    // Act 4 — the Cold Fork ranger station.
    // ---------------------------------------------------------------------
    shed(b, 17, 4, -18, 13, 3.4, 10, 'west', 1.8);
    b.box(17, 7.4, -18, 14.4, 1.1, 11.2, 'wood', PLANK_DARK); // snow-laden roof
    b.box(11.5, 4, -13.6, 4, 0.2, 3, 'wood', PLANK_DARK); // porch
    b.box(9.6, 4, -13.6, 0.2, 1, 3, 'wood', PLANK); // porch rail

    // Interior clutter, all solid so it can be used as cover.
    b.box(20, 4, -21, 2.2, 0.8, 0.9, 'wood', PLANK_DARK); // desk
    b.box(14, 4, -21.5, 1, 1.8, 0.6, 'metal', PALETTE.steelDark); // locker
    b.box(21.5, 4, -15, 1.4, 1.1, 1.4, 'wood', PLANK); // crate stack
    b.box(21.5, 5.1, -15, 1, 0.9, 1, 'wood', PLANK);

    b.pickup(
      { type: 'weapon', weapon: 'smg', magazines: 3 },
      new Vector3(20, 4.9, -21),
      'MP-Kestrel',
    );
    b.pickup(
      { type: 'document', id: 'd02-carnet' },
      new Vector3(19, 4.9, -20.4),
      'Carnet de poste',
    );
    b.pickup({ type: 'armour', amount: 60 }, new Vector3(14, 4.2, -20.6), 'Gilet pare-balles');
    b.pickup(
      { type: 'ammo', weapon: 'colt', rounds: 21 },
      new Vector3(21.4, 6.2, -15),
      'Munitions .45',
    );

    b.trigger('station', new Vector3(11, 6, -16), new Vector3(8, 5, 8), true);

    b.enemy('trooper', new Vector3(20, 4, -16), Math.PI * 0.5, [], 'station');
    b.enemy(
      'trooper',
      new Vector3(8, 4, -20),
      -Math.PI / 2,
      [new Vector3(6, 4, -12), new Vector3(6, 4, -26), new Vector3(14, 4, -26)],
      'station',
    );
    b.enemy(
      'ranger',
      new Vector3(24, 4, -26),
      0,
      [new Vector3(24, 4, -26), new Vector3(24, 4, -10)],
      'station',
    );

    // ---------------------------------------------------------------------
    // Act 5 — the winch house and the pylon.
    // ---------------------------------------------------------------------
    pylon(b, -18, -26, 4, 11);
    shed(b, -19, 4, -35, 9, 3.2, 8, 'east', 1.8);
    b.box(-19, 7.2, -35, 10.2, 0.9, 9.2, 'metal', PALETTE.steelDark);

    b.box(-21, 4, -37, 2.6, 1.5, 1.6, 'metal', PALETTE.steelDark); // winch drum housing
    const drum = new Mesh(new CylinderGeometry(0.8, 0.8, 2.2, 12), toon(STEEL, { ramp: 'trio' }));
    drum.rotation.z = Math.PI / 2;
    b.decor(drum, -21, 6.2, -37);
    b.box(-16, 4, -33, 1.2, 1.6, 0.8, 'metal', PALETTE.rust); // breaker cabinet

    b.pickup(
      { type: 'weapon', weapon: 'rifle', magazines: 2 },
      new Vector3(-22, 4.9, -33.5),
      'Winchester 70',
    );
    b.pickup({ type: 'memory', id: 'm04-lunette' }, new Vector3(-22, 5.2, -34.4), 'Souvenir');
    b.pickup({ type: 'health', amount: 35 }, new Vector3(-16.5, 4.2, -36.5), 'Trousse de secours');
    b.pickup(
      { type: 'ammo', weapon: 'smg', rounds: 90 },
      new Vector3(-14, 4.2, -30),
      'Munitions 9 mm',
    );

    b.trigger('winch-room', new Vector3(-15, 6, -32), new Vector3(8, 5, 8), true);
    b.interactable('power', new Vector3(-16, 5, -32.4), 'Réenclencher le disjoncteur', {
      radius: 2.2,
    });

    b.enemy(
      'trooper',
      new Vector3(-12, 4, -30),
      Math.PI,
      [new Vector3(-12, 4, -22), new Vector3(-12, 4, -38)],
      'winch',
    );
    b.enemy('trooper', new Vector3(-24, 4, -30), Math.PI * 0.25, [], 'winch');
    b.enemy('sentinel', new Vector3(-19, 4, -40), 0, [], 'winch');

    // ---------------------------------------------------------------------
    // Act 6 — the lower station. Exit.
    // ---------------------------------------------------------------------
    b.box(0, 4, -48, 12, 0.3, 8, 'metal', PALETTE.steelDark); // platform
    b.box(-6, 4.3, -48, 0.3, 1.1, 8, 'metal', STEEL);
    b.box(6, 4.3, -48, 0.3, 1.1, 8, 'metal', STEEL);
    b.box(0, 4.3, -52, 12, 1.1, 0.3, 'metal', STEEL);
    b.box(0, 7.5, -48, 13, 0.3, 9, 'metal', PALETTE.steelDark); // canopy
    for (const x of [-6, 6]) {
      b.box(x, 4.3, -44.5, 0.3, 3.2, 0.3, 'metal', STEEL);
      b.box(x, 4.3, -51.5, 0.3, 3.2, 0.3, 'metal', STEEL);
    }

    // The waiting car. Boarding it ends the chapter.
    b.box(0, 4.4, -46, 3.6, 0.2, 5, 'metal', PALETTE.steelDark);
    b.box(-1.8, 4.6, -46, 0.2, 2.3, 5, 'metal', 0xb5443a);
    b.box(1.8, 4.6, -46, 0.2, 2.3, 5, 'metal', 0xb5443a);
    b.box(0, 4.6, -48.4, 3.6, 2.3, 0.2, 'metal', 0xb5443a);
    b.box(0, 6.9, -46, 3.8, 0.2, 5.2, 'metal', PALETTE.steelDark);

    b.trigger('exfil', new Vector3(0, 6, -43), new Vector3(14, 5, 5), true);
    b.interactable('board', new Vector3(0, 5, -46), 'Monter dans la cabine', {
      radius: 2.6,
      enabled: false,
    });

    b.pickup({ type: 'memory', id: 'm05-rossiter' }, new Vector3(4.5, 4.6, -50), 'Souvenir');
    b.pickup(
      { type: 'ammo', weapon: 'rifle', rounds: 15 },
      new Vector3(-4.5, 4.6, -50),
      'Munitions .30-06',
    );

    // A last squad between the winch and the platform, so the ride down is earned.
    b.enemy(
      'trooper',
      new Vector3(-6, 4, -42),
      Math.PI,
      [new Vector3(-6, 4, -42), new Vector3(8, 4, -40)],
      'exfil',
    );
    b.enemy('sentinel', new Vector3(7, 4, -44), Math.PI * 1.1, [], 'exfil');
  },
};
