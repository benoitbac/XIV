import { Color } from 'three';

/**
 * XIV works from a deliberately small ink-and-flat-colour palette, the way a
 * printed album does. Every material in the game pulls from here so the frame
 * always reads as one plate.
 */
export const PALETTE = {
  ink: 0x141210,
  paper: 0xf2ece1,

  snow: 0xe4ebf2,
  snowShadow: 0xb9c7d6,
  sky: 0x9dbdd6,
  skyNight: 0x2b3a52,

  steel: 0x5c6672,
  steelDark: 0x3a424c,
  rust: 0x8d5433,
  wood: 0x6d4e35,
  woodDark: 0x4a3423,
  concrete: 0x9a9186,

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
