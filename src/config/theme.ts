/** Sortopia design tokens. */
export const COLORS = {
  bg: 0x171b36,
  bgDeep: 0x0e1126,
  bgTop: 0x262b5c,
  panel: 0x232853,
  panelLight: 0x2f3570,
  stroke: 0x434a92,
  purple: 0x9b72f2,
  pink: 0xff78b7,
  blue: 0x59b8f5,
  yellow: 0xffd166,
  green: 0x62d6a5,
  orange: 0xff9865,
  white: 0xffffff,
  textDim: 0xaab0e0,
  danger: 0xff5d73,
  gold: 0xffc94a,
} as const;

export const CSS = {
  text: '#FFFFFF',
  textDim: '#AAB0E0',
  textMuted: '#7E85C2',
  gold: '#FFD166',
  dark: '#171B36',
  danger: '#FF8296',
  green: '#62D6A5',
} as const;

export interface LiquidColor {
  name: string;
  base: number;
  light: number;
  dark: number;
}

function shade(hex: number, amount: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const f = (c: number) => (amount >= 0 ? Math.round(c + (255 - c) * amount) : Math.round(c * (1 + amount)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

function liquid(name: string, base: number): LiquidColor {
  return { name, base, light: shade(base, 0.38), dark: shade(base, -0.28) };
}

/**
 * Liquid palette, ordered so the earliest levels use the most distinct hues.
 * Each colour also has a unique symbol (see ui/Symbols) for colour-vision accessibility.
 */
const LIQUID_NAMES = ['Violet', 'Rose', 'Sky', 'Sun', 'Mint', 'Peach', 'Ruby', 'Cobalt', 'Lime', 'Pearl', 'Cocoa', 'Teal'];

/** Active liquid colours. Mutated in place by setLiquidPalette so every importer sees changes. */
export const LIQUIDS: LiquidColor[] = [0x9b72f2, 0xff78b7, 0x59b8f5, 0xffd166, 0x62d6a5, 0xff9865, 0xe8435a, 0x3b5bdb, 0xb5e14a, 0xeeeaf7, 0x9a5b3c, 0x13a69a].map((c, i) =>
  liquid(LIQUID_NAMES[i], c),
);

/** Swap the active palette (colour ids keep their meaning and symbols). */
export function setLiquidPalette(colors: readonly number[]): void {
  colors.forEach((c, i) => (LIQUIDS[i] = liquid(LIQUID_NAMES[i] ?? `C${i}`, c)));
}

/** Colour used for still-hidden "?" units. */
export const MYSTERY: LiquidColor = liquid('Mystery', 0x4a4f7a);

export const FONT = {
  family: '"Fredoka", "Trebuchet MS", "Segoe UI", system-ui, sans-serif',
} as const;

export function hexToCss(hex: number, alpha = 1): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export { shade };
