import type { SfxName } from '../core/Audio.ts';

export type WeaponId = 'fists' | 'colt' | 'silenced' | 'smg' | 'rifle' | 'shotgun' | 'grapnel';

export type WeaponClass = 'melee' | 'sidearm' | 'primary' | 'tool';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Shown in the codex; the albums always name the hardware. */
  caption: string;
  kind: WeaponClass;
  damage: number;
  headshotMultiplier: number;
  /** Rounds per minute. */
  rpm: number;
  automatic: boolean;
  magSize: number;
  reserveMax: number;
  /** Cone half-angle in radians, hip-fired. */
  spread: number;
  /** Multiplier applied to spread while aiming down the sights. */
  aimSpread: number;
  pellets: number;
  range: number;
  reloadSeconds: number;
  /** Vertical/horizontal camera kick, radians per shot. */
  recoilPitch: number;
  recoilYaw: number;
  /** How far the view model punches back, in metres. */
  kickback: number;
  sound: SfxName;
  /** Loud shots pull every guard in earshot; silenced ones travel less far. */
  noiseRadius: number;
  ejectsShell: boolean;
  /** Field-of-view multiplier when aiming. */
  aimFov: number;
  onomatopoeia: readonly string[];
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: {
    id: 'fists',
    name: 'Mains nues',
    caption: 'Ce que le Quatorzième avait sur lui en se réveillant.',
    kind: 'melee',
    damage: 34,
    headshotMultiplier: 3,
    rpm: 90,
    automatic: false,
    magSize: Infinity,
    reserveMax: 0,
    spread: 0,
    aimSpread: 1,
    pellets: 1,
    range: 1.9,
    reloadSeconds: 0,
    recoilPitch: 0.012,
    recoilYaw: 0.006,
    kickback: 0.05,
    sound: 'melee-swing',
    noiseRadius: 4,
    ejectsShell: false,
    aimFov: 1,
    onomatopoeia: ['WHAM', 'TCHAK', 'BAM'],
  },
  colt: {
    id: 'colt',
    name: 'Colt M1911',
    caption: 'Un chargeur, une douille manquante. Quelqu’un a déjà tiré.',
    kind: 'sidearm',
    damage: 32,
    headshotMultiplier: 3.4,
    rpm: 260,
    automatic: false,
    magSize: 7,
    reserveMax: 56,
    spread: 0.019,
    aimSpread: 0.28,
    pellets: 1,
    range: 90,
    reloadSeconds: 1.5,
    recoilPitch: 0.031,
    recoilYaw: 0.009,
    kickback: 0.075,
    sound: 'pistol',
    noiseRadius: 34,
    ejectsShell: true,
    aimFov: 0.86,
    onomatopoeia: ['BANG', 'BLAM', 'PAN'],
  },
  silenced: {
    id: 'silenced',
    name: 'Hush-22',
    caption: 'Silencieux intégré. Les gardes n’entendent que la douille tomber.',
    kind: 'sidearm',
    damage: 24,
    headshotMultiplier: 5,
    rpm: 300,
    automatic: false,
    magSize: 10,
    reserveMax: 80,
    spread: 0.013,
    aimSpread: 0.2,
    pellets: 1,
    range: 70,
    reloadSeconds: 1.6,
    recoilPitch: 0.015,
    recoilYaw: 0.005,
    kickback: 0.045,
    sound: 'silenced',
    noiseRadius: 7,
    ejectsShell: true,
    aimFov: 0.86,
    onomatopoeia: ['TCHIK', 'PFFT', 'SPTT'],
  },
  smg: {
    id: 'smg',
    name: 'MP-Kestrel',
    caption: 'L’arme de service du Conclave. Beaucoup de bruit pour peu de portée.',
    kind: 'primary',
    damage: 19,
    headshotMultiplier: 2.6,
    rpm: 780,
    automatic: true,
    magSize: 30,
    reserveMax: 210,
    spread: 0.036,
    aimSpread: 0.42,
    pellets: 1,
    range: 60,
    reloadSeconds: 2,
    recoilPitch: 0.017,
    recoilYaw: 0.011,
    kickback: 0.04,
    sound: 'rifle',
    noiseRadius: 44,
    ejectsShell: true,
    aimFov: 0.82,
    onomatopoeia: ['RRRRAT', 'BRRRAP', 'TAKATAK'],
  },
  rifle: {
    id: 'rifle',
    name: 'Winchester 70',
    caption: 'Un coup, une cible. Rechargement à verrou entre chaque.',
    kind: 'primary',
    damage: 88,
    headshotMultiplier: 3,
    rpm: 48,
    automatic: false,
    magSize: 5,
    reserveMax: 40,
    spread: 0.02,
    aimSpread: 0.02,
    pellets: 1,
    range: 260,
    reloadSeconds: 2.9,
    recoilPitch: 0.075,
    recoilYaw: 0.012,
    kickback: 0.16,
    sound: 'rifle',
    noiseRadius: 90,
    ejectsShell: true,
    aimFov: 0.42,
    onomatopoeia: ['KRAAK', 'CLAC', 'BOUM'],
  },
  shotgun: {
    id: 'shotgun',
    name: 'Remington court',
    caption: 'Scié. Ce qu’on garde sous un comptoir de station-service.',
    kind: 'primary',
    damage: 17,
    headshotMultiplier: 1.7,
    rpm: 75,
    automatic: false,
    magSize: 6,
    reserveMax: 36,
    spread: 0.1,
    aimSpread: 0.62,
    pellets: 9,
    range: 26,
    reloadSeconds: 3.1,
    recoilPitch: 0.09,
    recoilYaw: 0.02,
    kickback: 0.2,
    sound: 'shotgun',
    noiseRadius: 70,
    ejectsShell: true,
    aimFov: 0.94,
    onomatopoeia: ['BOOM', 'DOOM', 'WHAAM'],
  },
  grapnel: {
    id: 'grapnel',
    name: 'Grappin',
    caption: 'Trouvé dans le sac du mort. Il devait, lui aussi, s’enfuir.',
    kind: 'tool',
    damage: 0,
    headshotMultiplier: 1,
    rpm: 40,
    automatic: false,
    magSize: Infinity,
    reserveMax: 0,
    spread: 0,
    aimSpread: 1,
    pellets: 1,
    range: 24,
    reloadSeconds: 0,
    recoilPitch: 0,
    recoilYaw: 0,
    kickback: 0.06,
    sound: 'slide',
    noiseRadius: 6,
    ejectsShell: false,
    aimFov: 1,
    onomatopoeia: ['TCHOK'],
  },
};

export const WEAPON_ORDER: readonly WeaponId[] = [
  'fists',
  'colt',
  'silenced',
  'smg',
  'shotgun',
  'rifle',
  'grapnel',
];

export interface AmmoState {
  mag: number;
  reserve: number;
}

export const secondsPerShot = (def: WeaponDef): number => 60 / def.rpm;
