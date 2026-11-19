import type { PlayConfig, PlayStats } from '../types/game';

/** Coins needed to buy one hint when the free supply runs out. Earned in play only, never bought. */
export const HINT_PRICE = 30;
/** Every N Classic levels a milestone chest is awarded. */
export const MILESTONE_EVERY = 10;
export const MILESTONE_COINS = 100;
export const MILESTONE_HINTS = 2;

/** Star rating from moves vs the verified par. A hint or an Extra Bottle caps at 2 stars. */
export function computeStars(moves: number, par: number, hintsUsed: number, extraUsed = 0): number {
  let stars = 1;
  if (moves <= par) stars = 3;
  else if (moves <= Math.ceil(par * 1.35) + 1) stars = 2;
  if (hintsUsed > 0 || extraUsed > 0) stars = Math.min(stars, 2);
  return stars;
}

export function isPerfect(stars: number, stats: PlayStats): boolean {
  return stars === 3 && stats.undosUsed === 0 && stats.hintsUsed === 0 && !stats.extraUsed;
}

export function computeScore(config: PlayConfig, stats: PlayStats): number {
  const base = config.colors * 120;
  const efficiency = Math.max(0, config.par * 1.6 - stats.moves) * 25;
  const timeBonus = config.timeLimit && stats.timeLeft ? Math.floor(stats.timeLeft) * 10 : 0;
  const penalties = stats.hintsUsed * 150 + stats.undosUsed * 15;
  return Math.max(50, Math.round(base + efficiency + timeBonus - penalties));
}

/** Coins for a Classic clear. Replays only pay for improvements, so rewards can't be farmed. */
export function classicCoins(stars: number, perfect: boolean, prevStars: number, prevPerfect: boolean, firstClear: boolean): number {
  if (firstClear) return 10 + stars * 5 + (perfect ? 15 : 0);
  return 2 + Math.max(0, stars - prevStars) * 5 + (perfect && !prevPerfect ? 15 : 0);
}

export function dailyCoins(streak: number): number {
  return 40 + 10 * Math.min(streak, 7);
}

export function stageCoins(stage: number, stars: number): number {
  return 5 + stage * 2 + stars * 2;
}

export function xpFor(stars: number, firstClear: boolean): number {
  const xp = 10 + stars * 10;
  return firstClear ? xp : Math.ceil(xp / 2);
}

/** Total XP required to reach player level L (L ≥ 1). */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export function playerLevelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

/** 0..1 progress towards the next player level. */
export function levelProgress(xp: number): number {
  const lvl = playerLevelFromXp(xp);
  const a = xpForLevel(lvl);
  const b = xpForLevel(lvl + 1);
  return (xp - a) / (b - a);
}
