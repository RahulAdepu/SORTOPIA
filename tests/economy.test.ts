import { describe, expect, it } from 'vitest';
import { BOOSTS, BOTTLE_STYLES, LEVEL_UP_REWARD, PALETTES } from '../src/data/catalog';
import { classicConfig } from '../src/modes/GameModes';
import { evaluateAchievements } from '../src/systems/Achievements';
import { applyWin } from '../src/systems/ProgressManager';
import { computeStars, isPerfect, xpForLevel } from '../src/systems/RewardManager';
import { parseSave, serializeSave } from '../src/systems/SaveManager';
import {
  buyBottle,
  buyExtraBottle,
  buyHintPack,
  consumeExtraBottle,
  equipBottle,
  equipPalette,
  MAX_EXTRA_BOTTLES,
  ownsBottle,
  paletteUnlocked,
} from '../src/systems/ShopManager';
import { defaultSave } from '../src/types/save';

describe('shop: bottle styles (coins)', () => {
  it('starts with the free style equipped', () => {
    const s = defaultSave();
    expect(ownsBottle(s, 'classic')).toBe(true);
    expect(s.cosmetics.bottle).toBe('classic');
  });

  it('buys, auto-equips and refuses duplicates or unaffordable styles', () => {
    const s = defaultSave();
    const frost = BOTTLE_STYLES.find((b) => b.id === 'frost')!;
    s.coins = frost.price - 1;
    expect(buyBottle(s, 'frost')).toEqual({ ok: false, reason: 'coins' });
    s.coins = frost.price + 10;
    expect(buyBottle(s, 'frost').ok).toBe(true);
    expect(s.coins).toBe(10);
    expect(s.cosmetics.bottle).toBe('frost');
    expect(buyBottle(s, 'frost')).toEqual({ ok: false, reason: 'owned' });
    expect(equipBottle(s, 'classic').ok).toBe(true);
    expect(equipBottle(s, 'crystal').ok).toBe(false);
  });

  it('every style has a unique id and a non-decreasing price ladder', () => {
    const ids = new Set(BOTTLE_STYLES.map((b) => b.id));
    expect(ids.size).toBe(BOTTLE_STYLES.length);
    for (let i = 1; i < BOTTLE_STYLES.length; i++) expect(BOTTLE_STYLES[i].price).toBeGreaterThanOrEqual(BOTTLE_STYLES[i - 1].price);
  });
});

describe('shop: palettes (stars, never spent)', () => {
  it('unlocks by total stars and keeps 12 distinct colours per palette', () => {
    const s = defaultSave();
    const pastel = PALETTES.find((p) => p.id === 'pastel')!;
    expect(paletteUnlocked(s, 'pastel')).toBe(false);
    expect(equipPalette(s, 'pastel')).toEqual({ ok: false, reason: 'stars' });
    for (let i = 1; i <= Math.ceil(pastel.stars / 3); i++) s.levels[String(i)] = { stars: 3, bestScore: 1, bestMoves: 1, perfect: false };
    expect(paletteUnlocked(s, 'pastel')).toBe(true);
    expect(equipPalette(s, 'pastel').ok).toBe(true);
    expect(s.cosmetics.palette).toBe('pastel');
    for (const p of PALETTES) {
      expect(p.colors.length).toBe(12);
      expect(new Set(p.colors).size).toBe(12);
    }
  });
});

describe('shop: boosts', () => {
  it('buys and consumes extra bottles, buying on the spot when out', () => {
    const s = defaultSave();
    s.coins = 1000;
    const start = s.items.extraBottles;
    expect(buyExtraBottle(s).ok).toBe(true);
    expect(s.items.extraBottles).toBe(start + 1);
    s.items.extraBottles = MAX_EXTRA_BOTTLES;
    expect(buyExtraBottle(s)).toEqual({ ok: false, reason: 'max' });
    s.items.extraBottles = 0;
    const coins = s.coins;
    expect(consumeExtraBottle(s).ok).toBe(true);
    expect(s.coins).toBe(coins - BOOSTS.extraBottle.price);
    s.coins = 0;
    expect(consumeExtraBottle(s)).toEqual({ ok: false, reason: 'coins' });
  });

  it('hint packs add hints for coins', () => {
    const s = defaultSave();
    s.coins = BOOSTS.hintPack.price;
    const h = s.hints;
    expect(buyHintPack(s).ok).toBe(true);
    expect(s.hints).toBe(h + BOOSTS.hintPack.amount);
    expect(buyHintPack(s).ok).toBe(false);
  });
});

describe('rewards integration', () => {
  it('an extra bottle caps stars at 2 and is never perfect', () => {
    expect(computeStars(5, 10, 0, 1)).toBe(2);
    expect(isPerfect(3, { moves: 5, hintsUsed: 0, undosUsed: 0, extraUsed: 1, elapsed: 1 })).toBe(false);
  });

  it('player level-ups pay coins and hints', () => {
    const s = defaultSave();
    s.xp = xpForLevel(2) - 1;
    const c = classicConfig(1);
    const r = applyWin(s, c, { moves: c.par, hintsUsed: 0, undosUsed: 0, elapsed: 5 });
    expect(r.playerLevelAfter).toBeGreaterThan(r.playerLevelBefore);
    expect(r.levelUpCoins).toBe(LEVEL_UP_REWARD.coins * (r.playerLevelAfter - r.playerLevelBefore));
    expect(r.levelUpHints).toBeGreaterThan(0);
  });

  it('the Collector achievement unlocks at 3 owned styles', () => {
    const s = defaultSave();
    s.coins = 10_000;
    buyBottle(s, 'frost');
    expect(evaluateAchievements(s)).not.toContain('collector');
    buyBottle(s, 'gold');
    expect(evaluateAchievements(s)).toContain('collector');
  });
});

describe('save compatibility', () => {
  it('older saves without cosmetics/items load with defaults', () => {
    const legacy = parseSave(JSON.stringify({ coins: 10, levels: { 1: { stars: 3, bestScore: 5, bestMoves: 4, perfect: true } } }));
    expect(legacy.cosmetics.bottle).toBe('classic');
    expect(legacy.items.extraBottles).toBeGreaterThanOrEqual(0);
  });

  it('round-trips cosmetics and rejects equipping unowned items from a tampered save', () => {
    const s = defaultSave();
    s.coins = 999;
    buyBottle(s, 'frost');
    expect(parseSave(serializeSave(s)).cosmetics).toEqual(s.cosmetics);
    const tampered = parseSave(JSON.stringify({ ...s, cosmetics: { owned: ['bottle:classic'], bottle: 'crystal', palette: 'neon' } }));
    expect(tampered.cosmetics.bottle).toBe('classic');
    expect(tampered.cosmetics.palette).toBe('classic');
  });
});
