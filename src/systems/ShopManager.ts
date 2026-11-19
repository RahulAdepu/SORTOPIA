import { BOOSTS, BOTTLE_STYLES, PALETTES } from '../data/catalog';
import type { SaveData } from '../types/save';
import { totalStars } from './Achievements';

export type ShopResult = { ok: true } | { ok: false; reason: 'owned' | 'coins' | 'stars' | 'unknown' | 'max' };

export const MAX_EXTRA_BOTTLES = 9;

export function ownsBottle(save: SaveData, id: string): boolean {
  return save.cosmetics.owned.includes(`bottle:${id}`);
}

export function paletteUnlocked(save: SaveData, id: string): boolean {
  const p = PALETTES.find((x) => x.id === id);
  return !!p && (save.cosmetics.owned.includes(`palette:${id}`) || totalStars(save) >= p.stars);
}

export function buyBottle(save: SaveData, id: string): ShopResult {
  const style = BOTTLE_STYLES.find((b) => b.id === id);
  if (!style) return { ok: false, reason: 'unknown' };
  if (ownsBottle(save, id)) return { ok: false, reason: 'owned' };
  if (save.coins < style.price) return { ok: false, reason: 'coins' };
  save.coins -= style.price;
  save.cosmetics.owned.push(`bottle:${id}`);
  save.cosmetics.bottle = id;
  return { ok: true };
}

export function equipBottle(save: SaveData, id: string): ShopResult {
  if (!ownsBottle(save, id)) return { ok: false, reason: 'unknown' };
  save.cosmetics.bottle = id;
  return { ok: true };
}

/** Palettes are earned with stars (never spent): reaching the threshold unlocks them for good. */
export function equipPalette(save: SaveData, id: string): ShopResult {
  if (!PALETTES.some((p) => p.id === id)) return { ok: false, reason: 'unknown' };
  if (!paletteUnlocked(save, id)) return { ok: false, reason: 'stars' };
  if (!save.cosmetics.owned.includes(`palette:${id}`)) save.cosmetics.owned.push(`palette:${id}`);
  save.cosmetics.palette = id;
  return { ok: true };
}

export function buyExtraBottle(save: SaveData): ShopResult {
  if (save.items.extraBottles >= MAX_EXTRA_BOTTLES) return { ok: false, reason: 'max' };
  if (save.coins < BOOSTS.extraBottle.price) return { ok: false, reason: 'coins' };
  save.coins -= BOOSTS.extraBottle.price;
  save.items.extraBottles++;
  return { ok: true };
}

export function buyHintPack(save: SaveData): ShopResult {
  if (save.coins < BOOSTS.hintPack.price) return { ok: false, reason: 'coins' };
  save.coins -= BOOSTS.hintPack.price;
  save.hints += BOOSTS.hintPack.amount;
  return { ok: true };
}

/**
 * Use an Extra Bottle in a puzzle: consume one from inventory, or buy one on
 * the spot if the player can afford it.
 */
export function consumeExtraBottle(save: SaveData): ShopResult {
  if (save.items.extraBottles > 0) {
    save.items.extraBottles--;
    return { ok: true };
  }
  if (save.coins < BOOSTS.extraBottle.price) return { ok: false, reason: 'coins' };
  save.coins -= BOOSTS.extraBottle.price;
  return { ok: true };
}

export function ownedBottleCount(save: SaveData): number {
  return BOTTLE_STYLES.filter((b) => ownsBottle(save, b.id)).length;
}
