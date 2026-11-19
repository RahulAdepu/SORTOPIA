import { describe, expect, it } from 'vitest';
import { classicConfig, dailyConfig, isModeUnlocked, MODES, movesStageConfig, timeStageConfig } from '../src/modes/GameModes';
import { ACHIEVEMENTS, evaluateAchievements, totalStars } from '../src/systems/Achievements';
import {
  applyWin,
  canAffordHint,
  currentDailyStreak,
  isDailyDone,
  isLevelUnlocked,
  recordInProgress,
  spendHint,
} from '../src/systems/ProgressManager';
import {
  classicCoins,
  computeScore,
  computeStars,
  HINT_PRICE,
  levelProgress,
  playerLevelFromXp,
  xpForLevel,
} from '../src/systems/RewardManager';
import { parseSave, SaveManager, serializeSave } from '../src/systems/SaveManager';
import { WebMockAdapter } from '../src/integrations/playables/WebMockAdapter';
import { defaultSave } from '../src/types/save';
import type { PlayStats } from '../src/types/game';

const stats = (moves: number, extra: Partial<PlayStats> = {}): PlayStats => ({ moves, hintsUsed: 0, undosUsed: 0, elapsed: 30, ...extra });

describe('stars and score', () => {
  it('awards 3 stars at or under par', () => {
    expect(computeStars(10, 10, 0)).toBe(3);
    expect(computeStars(8, 10, 0)).toBe(3);
  });
  it('awards fewer stars for more moves', () => {
    expect(computeStars(13, 10, 0)).toBe(2);
    expect(computeStars(40, 10, 0)).toBe(1);
  });
  it('caps at 2 stars when a hint was used', () => {
    expect(computeStars(5, 10, 1)).toBe(2);
  });
  it('rewards efficiency and penalises hints', () => {
    const c = classicConfig(20);
    expect(computeScore(c, stats(c.par))).toBeGreaterThan(computeScore(c, stats(c.par + 10)));
    expect(computeScore(c, stats(c.par))).toBeGreaterThan(computeScore(c, stats(c.par, { hintsUsed: 1 })));
    expect(computeScore(c, stats(999))).toBeGreaterThanOrEqual(50);
  });
  it('score is always an integer (Playables requirement)', () => {
    const c = timeStageConfig(3);
    expect(Number.isInteger(computeScore(c, stats(c.par, { timeLeft: 12.7 })))).toBe(true);
  });
});

describe('level unlocking and rewards', () => {
  it('only level 1 is unlocked at start', () => {
    const s = defaultSave();
    expect(isLevelUnlocked(s, 1)).toBe(true);
    expect(isLevelUnlocked(s, 2)).toBe(false);
  });

  it('winning a level unlocks the next one and pays coins/xp', () => {
    const s = defaultSave();
    const coins0 = s.coins;
    const c = classicConfig(1);
    const r = applyWin(s, c, stats(c.par));
    expect(isLevelUnlocked(s, 2)).toBe(true);
    expect(r.stars).toBe(3);
    expect(r.perfect).toBe(true);
    expect(r.firstClear).toBe(true);
    expect(s.coins).toBeGreaterThan(coins0);
    expect(s.xp).toBeGreaterThan(0);
    expect(s.levels['1'].stars).toBe(3);
    expect(r.achievements).toContain('first-sort');
    expect(r.achievements).toContain('perfect-1');
  });

  it('replaying cannot farm full rewards', () => {
    const s = defaultSave();
    const c = classicConfig(1);
    const first = applyWin(s, c, stats(c.par));
    const replay = applyWin(s, c, stats(c.par));
    expect(replay.coins).toBeLessThan(first.coins);
    expect(replay.firstClear).toBe(false);
  });

  it('keeps the best record and never lowers stars', () => {
    const s = defaultSave();
    const c = classicConfig(1);
    applyWin(s, c, stats(c.par));
    applyWin(s, c, stats(c.par + 20));
    expect(s.levels['1'].stars).toBe(3);
    expect(s.levels['1'].bestMoves).toBe(c.par);
  });

  it('awards a milestone chest every 10 levels exactly once', () => {
    const s = defaultSave();
    s.unlocked = 10;
    const c = classicConfig(10);
    const r = applyWin(s, c, stats(c.par));
    expect(r.milestoneCoins).toBeGreaterThan(0);
    expect(r.hintsAwarded).toBeGreaterThan(0);
    const again = applyWin(s, c, stats(c.par));
    expect(again.milestoneCoins).toBe(0);
  });

  it('classic coin formula pays improvements on replays', () => {
    expect(classicCoins(3, false, 1, false, false)).toBeGreaterThan(classicCoins(1, false, 1, false, false));
  });

  it('reported score equals the best total in the save', () => {
    const s = defaultSave();
    for (let i = 1; i <= 3; i++) {
      const c = classicConfig(i);
      applyWin(s, c, stats(c.par));
    }
    const sum = Object.values(s.levels).reduce((a, l) => a + l.bestScore, 0);
    expect(s.bestTotalScore).toBe(sum);
  });

  it('clears the in-progress save when the level is won', () => {
    const s = defaultSave();
    const c = classicConfig(1);
    recordInProgress(s, c, [[2, 3]], 1, 0, 0);
    expect(s.inProgress?.level).toBe(1);
    applyWin(s, c, stats(c.par));
    expect(s.inProgress).toBeNull();
  });

  it('player level grows with XP', () => {
    expect(playerLevelFromXp(0)).toBe(1);
    expect(playerLevelFromXp(xpForLevel(3))).toBe(3);
    expect(levelProgress(xpForLevel(2) + 1)).toBeGreaterThan(0);
  });
});

describe('daily challenge', () => {
  it('builds and maintains a streak across consecutive days', () => {
    const s = defaultSave();
    applyWin(s, dailyConfig('2026-11-16'), stats(20), '2026-11-16');
    applyWin(s, dailyConfig('2026-11-17'), stats(20), '2026-11-17');
    const r = applyWin(s, dailyConfig('2026-11-18'), stats(20), '2026-11-18');
    expect(s.daily.streak).toBe(3);
    expect(r.achievements).toContain('streak-3');
    expect(isDailyDone(s, '2026-11-18')).toBe(true);
    expect(currentDailyStreak(s, '2026-11-19')).toBe(3);
    expect(currentDailyStreak(s, '2026-11-21')).toBe(0);
  });

  it('resets the streak after a missed day', () => {
    const s = defaultSave();
    applyWin(s, dailyConfig('2026-11-10'), stats(20), '2026-11-10');
    applyWin(s, dailyConfig('2026-11-12'), stats(20), '2026-11-12');
    expect(s.daily.streak).toBe(1);
    expect(s.daily.bestStreak).toBe(1);
  });

  it('pays the daily reward only once per day', () => {
    const s = defaultSave();
    const a = applyWin(s, dailyConfig('2026-11-18'), stats(20), '2026-11-18');
    const b = applyWin(s, dailyConfig('2026-11-18'), stats(20), '2026-11-18');
    expect(a.coins).toBeGreaterThan(0);
    expect(b.coins).toBe(0);
    expect(s.daily.totalCompleted).toBe(1);
  });
});

describe('ladder modes, hints, achievements', () => {
  it('records best stages', () => {
    const s = defaultSave();
    applyWin(s, timeStageConfig(3), stats(10, { timeLeft: 5 }));
    applyWin(s, movesStageConfig(2), stats(10));
    expect(s.stats.timeBestStage).toBe(3);
    expect(s.stats.movesBestStage).toBe(2);
  });

  it('spends free hints first, then coins, then refuses', () => {
    const s = defaultSave();
    s.hints = 1;
    s.coins = HINT_PRICE;
    expect(spendHint(s)).toBe(true);
    expect(s.hints).toBe(0);
    expect(spendHint(s)).toBe(true);
    expect(s.coins).toBe(0);
    expect(canAffordHint(s)).toBe(false);
    expect(spendHint(s)).toBe(false);
  });

  it('achievements unlock once and pay their reward', () => {
    const s = defaultSave();
    s.levels['1'] = { stars: 3, bestScore: 100, bestMoves: 4, perfect: true };
    const coins = s.coins;
    const ids = evaluateAchievements(s);
    expect(ids).toContain('first-sort');
    expect(s.coins).toBe(coins + ACHIEVEMENTS.find((a) => a.id === 'first-sort')!.reward);
    expect(evaluateAchievements(s)).toEqual([]);
    expect(totalStars(s)).toBe(3);
  });

  it('modes unlock with classic progress', () => {
    const s = defaultSave();
    expect(isModeUnlocked(MODES.zen, s)).toBe(true);
    expect(isModeUnlocked(MODES.moves, s)).toBe(false);
    s.unlocked = 11;
    expect(isModeUnlocked(MODES.moves, s)).toBe(true);
  });
});

describe('progress saving', () => {
  it('round-trips through serialize/parse', () => {
    const s = defaultSave();
    const c = classicConfig(1);
    applyWin(s, c, stats(c.par));
    s.settings.music = 0.2;
    const back = parseSave(serializeSave(s));
    expect(back).toEqual(s);
  });

  it('survives corrupt, empty and legacy data', () => {
    expect(parseSave('')).toEqual(defaultSave());
    expect(parseSave('{not json')).toEqual(defaultSave());
    expect(parseSave('[]')).toEqual(defaultSave());
    const legacy = parseSave(JSON.stringify({ coins: 99, levels: { 1: { stars: 9 }, 500: { stars: 1 } }, settings: { music: 7 } }));
    expect(legacy.coins).toBe(99);
    expect(legacy.levels['1'].stars).toBe(3);
    expect(legacy.levels['500']).toBeUndefined();
    expect(legacy.settings.music).toBe(1);
  });

  it('SaveManager awaits loadData before saving and persists through the adapter', async () => {
    const platform = new WebMockAdapter(false);
    const sm = new SaveManager(platform);
    sm.save(0);
    await sm.flush();
    expect(platform.calls.some((c) => c.startsWith('saveData'))).toBe(false);
    await sm.load();
    sm.data.coins = 1234;
    await sm.flush();
    expect(platform.calls[0]).toBe('loadData');
    expect(platform.calls.some((c) => c.startsWith('saveData'))).toBe(true);
    const sm2 = new SaveManager(platform);
    await sm2.load();
    expect(sm2.data.coins).toBe(1234);
  });

  it('save payload stays well under the Playables size budget', () => {
    const s = defaultSave();
    for (let i = 1; i <= 100; i++) s.levels[String(i)] = { stars: 3, bestScore: 99999, bestMoves: 99, perfect: true };
    s.inProgress = { level: 50, history: Array.from({ length: 300 }, () => [1, 2] as [number, number]), moves: 300, hintsUsed: 0, undosUsed: 0 };
    expect(serializeSave(s).length).toBeLessThan(64 * 1024);
  });
});

describe('daily challenge edge cases (audit regressions)', () => {
  it("counts yesterday's puzzle when it is finished just after UTC midnight", () => {
    const s = defaultSave();
    applyWin(s, dailyConfig('2026-11-17'), stats(20), '2026-11-17');
    const late = applyWin(s, dailyConfig('2026-11-18'), stats(20), '2026-11-19');
    expect(late.coins).toBeGreaterThan(0);
    expect(s.daily.streak).toBe(2);
    expect(currentDailyStreak(s, '2026-11-19')).toBe(2);
    // ...and today's puzzle is still available for its own reward.
    expect(isDailyDone(s, '2026-11-19')).toBe(false);
    expect(applyWin(s, dailyConfig('2026-11-19'), stats(20), '2026-11-19').coins).toBeGreaterThan(0);
    expect(s.daily.streak).toBe(3);
  });

  it('pays nothing for stale (older than yesterday) puzzles', () => {
    const s = defaultSave();
    const r = applyWin(s, dailyConfig('2026-11-01'), stats(20), '2026-11-18');
    expect(r.coins).toBe(0);
    expect(s.daily.totalCompleted).toBe(0);
  });
});
