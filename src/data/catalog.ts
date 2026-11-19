/**
 * Everything players can earn and spend. All currency is earned in play:
 * there are no purchases and nothing here affects puzzle difficulty except
 * the Extra Bottle boost, which caps the level at 2 stars.
 */

export interface BottleStyle {
  id: string;
  name: string;
  description: string;
  /** Price in coins (0 = free). */
  price: number;
  /** Glass outline gradient stops, left → right. */
  rim: string[];
  /** Rim/lip gradient, top → bottom. */
  lip: [string, string];
  /** Back-pane tint at the edges and in the middle. */
  tint: [string, string];
  /** Optional coloured halo around the glass. */
  halo?: string;
  /** Subtle frost speckles on the glass. */
  frost?: boolean;
}

export const BOTTLE_STYLES: BottleStyle[] = [
  {
    id: 'classic',
    name: 'Clear Glass',
    description: 'Plain clear glass',
    price: 0,
    rim: ['rgba(255,255,255,0.85)', 'rgba(225,230,255,0.55)', 'rgba(255,255,255,0.75)'],
    lip: ['rgba(255,255,255,0.95)', 'rgba(200,208,255,0.65)'],
    tint: ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.05)'],
  },
  {
    id: 'frost',
    name: 'Frosted',
    description: 'Icy rim, frosted speckles',
    price: 250,
    rim: ['#E6FBFF', 'rgba(150,220,255,0.75)', '#DFF7FF'],
    lip: ['#FFFFFF', '#9FDFFF'],
    tint: ['rgba(170,230,255,0.26)', 'rgba(170,230,255,0.08)'],
    frost: true,
  },
  {
    id: 'gold',
    name: 'Gilded',
    description: 'Gold rim and lip',
    price: 450,
    rim: ['#FFE9A6', '#E3A93A', '#FFF1C2'],
    lip: ['#FFE58A', '#C88A1E'],
    tint: ['rgba(255,220,150,0.16)', 'rgba(255,220,150,0.05)'],
  },
  {
    id: 'neon',
    name: 'Neon Glow',
    description: 'Pink-to-cyan glowing rim',
    price: 700,
    rim: ['#FF6AD5', '#8A6CFF', '#4FE3FF'],
    lip: ['#FF9BE6', '#7A5CFF'],
    tint: ['rgba(200,120,255,0.14)', 'rgba(120,200,255,0.05)'],
    halo: 'rgba(255,106,213,0.55)',
  },
  {
    id: 'crystal',
    name: 'Prism Crystal',
    description: 'Rainbow-tinted rim',
    price: 1000,
    rim: ['#FFB3E6', '#B3E5FF', '#D4FFB3', '#FFF1B3', '#FFC4B3'],
    lip: ['#FFFFFF', '#D9C7FF'],
    tint: ['rgba(255,200,240,0.16)', 'rgba(200,240,255,0.06)'],
    halo: 'rgba(200,230,255,0.45)',
  },
];

export interface PaletteDef {
  id: string;
  name: string;
  description: string;
  /** Total stars needed to unlock (0 = free). */
  stars: number;
  colors: number[];
}

/** Each palette keeps 12 clearly distinct hues in the same order (symbols map 1:1). */
export const PALETTES: PaletteDef[] = [
  {
    id: 'classic',
    name: 'Sortopia',
    description: 'The original colours',
    stars: 0,
    colors: [0x9b72f2, 0xff78b7, 0x59b8f5, 0xffd166, 0x62d6a5, 0xff9865, 0xe8435a, 0x3b5bdb, 0xb5e14a, 0xeeeaf7, 0x9a5b3c, 0x13a69a],
  },
  {
    id: 'pastel',
    name: 'Pastel Dream',
    description: 'Lighter, softer colours',
    stars: 45,
    colors: [0xb9a2f7, 0xffa8cb, 0x8fd0f7, 0xffe29a, 0x93e5c1, 0xffb894, 0xf2737f, 0x7189f0, 0xc9eb7e, 0xfff7ea, 0xb98668, 0x4fc3b5],
  },
  {
    id: 'jewel',
    name: 'Jewel Box',
    description: 'Deeper, darker colours',
    stars: 120,
    colors: [0x8a4fe0, 0xf25c9f, 0x2f80ed, 0xf5b700, 0x1db97e, 0xf07c2b, 0xd3203f, 0x2e3fb8, 0x9bcb2e, 0xdce3f2, 0xa8692f, 0x0fb5c9],
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    description: 'Bright neon colours',
    stars: 210,
    colors: [0xb266ff, 0xff4fd8, 0x33c8ff, 0xfff14d, 0x3dffa2, 0xff8a3d, 0xff3b5c, 0x4d5bff, 0xb8ff3d, 0xf5f5ff, 0xc77b4a, 0x19e6d2],
  },
];

export const BOOSTS = {
  extraBottle: { id: 'extraBottle', name: 'Extra Bottle', description: 'Adds an empty bottle to the current puzzle (max 2 stars).', price: 80 },
  hintPack: { id: 'hintPack', name: 'Hint Pack', description: 'Three hints at a discount.', price: 75, amount: 3 },
} as const;

/** Rewards granted for each player level gained. */
export const LEVEL_UP_REWARD = { coins: 40, hints: 1 } as const;
