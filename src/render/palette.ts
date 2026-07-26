import { Color } from 'three';

/**
 * XIV works from a deliberately small ink-and-flat-colour palette, the way a
 * printed album does. Every material in the game pulls from here so the frame
 * always reads as one plate.
 */
export const PALETTE = {
  ink: 0x141210,
  paper: 0xf2ece1,

  // Album colour: saturated flats, printed bright. The ramp floors are high
  // enough that the shaded band keeps its hue, so albedos can be strong
  // without the lit side blowing out.
  snow: 0xe8f0f7,
  snowShadow: 0xa8bfd6,
  sky: 0x4f8fc4,
  skyNight: 0x2b3a52,

  steel: 0x6b7686,
  steelDark: 0x3f4753,
  rust: 0xa85a2c,
  wood: 0x8a5a30,
  woodDark: 0x5a3a1e,
  concrete: 0xa79c8c,

  blood: 0xd8332a,
  alert: 0xe8493a,
  onomatopoeia: 0xf5c02e,
  hostile: 0xb03a2e,
  ally: 0x3f8fc4,

  hudInk: 0x1a1714,
  hudPaper: 0xece3d2,
} as const;

export type PaletteKey = keyof typeof PALETTE;

const cache = new Map<number, Color>();

/** Shared, immutable-by-convention Color instances — never mutate the result. */
export function color(hex: number): Color {
  let c = cache.get(hex);
  if (!c) {
    c = new Color(hex);
    cache.set(hex, c);
  }
  return c;
}

export const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
