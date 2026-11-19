import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/data/levels';
import { classicConfig, dailyConfig, MODES } from '../src/modes/GameModes';
import { WebMockAdapter } from '../src/integrations/playables/WebMockAdapter';
import { totalStars } from '../src/systems/Achievements';
import { PuzzleEngine } from '../src/systems/PuzzleEngine';
import { applyWin, isLevelUnlocked, recordInProgress } from '../src/systems/ProgressManager';
import { SaveManager } from '../src/systems/SaveManager';

/**
 * System-level journey: the same calls GameScene makes, without rendering.
 * Menu → Level → pours → completion → rewards → next level, for all 100 levels.
 */
describe('full player journey', () => {
  it('plays every Classic level in order, unlocking each next level and persisting progress', async () => {
    const platform = new WebMockAdapter(false);
    const saves = new SaveManager(platform);
    await saves.load();
    const save = saves.data;

    // "Continue" from a fresh save starts level 1.
    let config = MODES.classic.start(save);
    expect(config.level).toBe(1);

    for (let i = 0; i < LEVELS.length; i++) {
      const def = LEVELS[i];
      expect(config.level).toBe(def.id);
      expect(isLevelUnlocked(save, def.id)).toBe(true);
      const engine = new PuzzleEngine(config.puzzle);
      for (const [f, t] of def.solution) {
        expect(engine.pour(f, t), `level ${def.id}`).not.toBeNull();
        recordInProgress(save, config, engine.historyPairs, engine.moves, 0, 0);
        if (config.moveLimit) expect(engine.moves).toBeLessThanOrEqual(config.moveLimit);
      }
      expect(engine.isSolved(), `level ${def.id}`).toBe(true);
      const result = applyWin(save, config, { moves: engine.moves, hintsUsed: 0, undosUsed: 0, elapsed: 20 });
      expect(result.stars).toBe(3);
      expect(save.inProgress).toBeNull();
      await saves.flush();
      const next = MODES.classic.next(config, save);
      if (def.id < LEVELS.length) {
        expect(next?.level).toBe(def.id + 1);
        config = next!;
      } else {
        expect(next).toBeNull();
      }
    }

    expect(totalStars(save)).toBe(300);
    expect(save.achievements['levels-100']).toBeDefined();
    expect(save.achievements['stars-300']).toBeDefined();
    expect(save.milestones.length).toBe(10);

    // Progress restores from the platform save.
    const reloaded = new SaveManager(platform);
    await reloaded.load();
    expect(reloaded.data.unlocked).toBe(100);
    expect(totalStars(reloaded.data)).toBe(300);
    expect(reloaded.data.bestTotalScore).toBe(save.bestTotalScore);
  });

  it('resumes an in-progress level from the saved move list', () => {
    const save = new SaveManager(new WebMockAdapter(false)).data;
    const def = LEVELS[29];
    const first = classicConfig(def.id, save);
    const engine = new PuzzleEngine(first.puzzle);
    const half = def.solution.slice(0, 5);
    for (const [f, t] of half) engine.pour(f, t);
    recordInProgress(save, first, engine.historyPairs, engine.moves, 1, 2);

    const resumed = classicConfig(def.id, save);
    expect(resumed.resume?.history).toEqual(half);
    const e2 = new PuzzleEngine(resumed.puzzle);
    expect(e2.replay(resumed.resume!.history)).toBe(true);
    expect(e2.snapshot()).toEqual(engine.snapshot());
  });

  it('daily challenge journey pays out once and builds a streak', () => {
    const save = new SaveManager(new WebMockAdapter(false)).data;
    const cfg = dailyConfig('2026-11-18');
    const engine = new PuzzleEngine(cfg.puzzle);
    expect(engine.isSolved()).toBe(false);
    const r = applyWin(save, cfg, { moves: cfg.par, hintsUsed: 0, undosUsed: 0, elapsed: 60 }, '2026-11-18');
    expect(r.coins).toBeGreaterThan(0);
    expect(save.daily.streak).toBe(1);
  });
});
