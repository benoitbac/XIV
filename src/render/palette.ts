import { Color } from 'three';

/**
 * XIV works from a deliberately small ink-and-flat-colour palette, the way a
 * printed album does. Every material in the game pulls from here so the frame
 * always reads as one plate.
 */
export const PALETTE = {
  ink: 0x141210,
  paper: 0xf2ece1,

  // Albedos are deliberately mid-tone. The key light and the toon ramp supply
  // the brightness; starting from near-white leaves the ramp nowhere to go and
  // every lit surface clips to the same flat white.
  snow: 0xc2d2e0,
  snowShadow: 0x8fa3b8,
  sky: 0x6d94b8,
  skyNight: 0x2b3a52,

  steel: 0x4e5763,
  steelDark: 0x333a43,
  rust: 0x7a4529,
  wood: 0x5d4029,
  woodDark: 0x3e2b1c,
  concrete: 0x827a70,

  blood: 0xc4322a,
  alert: 0xd94a3d,
  onomatopoeia: 0xe9bb3c,
  hostile: 0x8a3b34,
  ally: 0x3f7fa6,

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
