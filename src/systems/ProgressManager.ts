import type { LevelResult, PlayConfig, PlayStats } from '../types/game';
import type { SaveData } from '../types/save';
import { addDays, utcDateKey } from '../utils/random';
import { LEVEL_UP_REWARD } from '../data/catalog';
import { evaluateAchievements } from './Achievements';
import {
  classicCoins,
  computeScore,
  computeStars,
  dailyCoins,
  HINT_PRICE,
  isPerfect,
  MILESTONE_COINS,
  MILESTONE_EVERY,
  MILESTONE_HINTS,
  playerLevelFromXp,
  stageCoins,
  xpFor,
} from './RewardManager';

const LEVEL_TOTAL = 100;

export function isLevelUnlocked(save: SaveData, level: number): boolean {
  return level >= 1 && level <= Math.min(save.unlocked, LEVEL_TOTAL);
}

/** Streak still alive today? (completed today or yesterday) */
export function currentDailyStreak(save: SaveData, today: string = utcDateKey()): number {
  const last = save.daily.lastCompleted;
  if (!last) return 0;
  if (last === today || last === addDays(today, -1)) return save.daily.streak;
  return 0;
}

export function isDailyDone(save: SaveData, today: string = utcDateKey()): boolean {
  return save.daily.lastCompleted === today;
}

/** Consume a hint, buying one with coins if none are left. Returns false when unaffordable. */
export function spendHint(save: SaveData): boolean {
  if (save.hints > 0) {
    save.hints--;
  } else if (save.coins >= HINT_PRICE) {
    save.coins -= HINT_PRICE;
  } else {
    return false;
  }
  save.stats.hintsUsed++;
  return true;
}

export function canAffordHint(save: SaveData): boolean {
  return save.hints > 0 || save.coins >= HINT_PRICE;
}

function recomputeTotalScore(save: SaveData): void {
  const sum = Object.values(save.levels).reduce((a, l) => a + l.bestScore, 0);
  save.bestTotalScore = Math.max(save.bestTotalScore, sum);
}

/**
 * Apply a win to the save: stars, scores, unlocks, coins, XP, streaks, stage
 * records and achievements. Pure with respect to everything except `save`.
 */
export function applyWin(save: SaveData, config: PlayConfig, stats: PlayStats, today: string = utcDateKey()): LevelResult {
  const levelBefore = playerLevelFromXp(save.xp);
  const stars = computeStars(stats.moves, config.par, stats.hintsUsed, stats.extraUsed ?? 0);
  const perfect = isPerfect(stars, stats);
  const score = computeScore(config, stats);
  let coins = 0;
  let xp = 0;
  let hintsAwarded = 0;
  let milestoneCoins = 0;
  let firstClear = false;
  let bestScore = score;
  let newBest = false;

  save.stats.totalMoves += stats.moves;
  if (perfect) save.stats.perfects++;

  switch (config.mode) {
    case 'classic': {
      const id = config.level as number;
      const key = String(id);
      const prev = save.levels[key];
      firstClear = !prev;
      coins = classicCoins(stars, perfect, prev?.stars ?? 0, prev?.perfect ?? false, firstClear);
      xp = xpFor(stars, firstClear);
      newBest = !prev || score > prev.bestScore;
      bestScore = Math.max(score, prev?.bestScore ?? 0);
      save.levels[key] = {
        stars: Math.max(stars, prev?.stars ?? 0),
        bestScore,
        bestMoves: prev ? Math.min(prev.bestMoves, stats.moves) : stats.moves,
        perfect: perfect || (prev?.perfect ?? false),
      };
      if (firstClear) save.stats.levelsCompleted++;
      if (id >= save.unlocked && id < LEVEL_TOTAL) save.unlocked = id + 1;
      if (id === LEVEL_TOTAL) save.unlocked = LEVEL_TOTAL;
      if (id % MILESTONE_EVERY === 0 && !save.milestones.includes(id)) {
        save.milestones.push(id);
        milestoneCoins = MILESTONE_COINS;
        hintsAwarded += MILESTONE_HINTS;
      }
      if (save.inProgress?.level === id) save.inProgress = null;
      recomputeTotalScore(save);
      break;
    }
    case 'daily': {
      const day = config.dateKey ?? today;
      // A puzzle started just before UTC midnight still counts when finished after it.
      const eligible = day === today || day === addDays(today, -1);
      const alreadyDone = save.daily.lastCompleted === day || save.daily.history.includes(day);
      firstClear = !alreadyDone;
      if (eligible && !alreadyDone) {
        const continuing = save.daily.lastCompleted === addDays(day, -1);
        save.daily.streak = continuing ? save.daily.streak + 1 : 1;
        save.daily.bestStreak = Math.max(save.daily.bestStreak, save.daily.streak);
        save.daily.lastCompleted = day;
        save.daily.totalCompleted++;
        save.daily.history = [...save.daily.history, day].slice(-60);
        coins = dailyCoins(save.daily.streak);
        hintsAwarded += 1;
        xp = 40;
      } else {
        coins = 0;
        xp = 5;
      }
      break;
    }
    case 'time':
    case 'moves': {
      const stage = config.stage ?? 1;
      const key = config.mode === 'time' ? 'timeBestStage' : 'movesBestStage';
      firstClear = stage > save.stats[key];
      newBest = firstClear;
      save.stats[key] = Math.max(save.stats[key], stage);
      coins = firstClear ? stageCoins(stage, stars) : 3;
      xp = 10 + stars * 5;
      break;
    }
    case 'zen': {
      save.stats.zenSolved++;
      coins = 5;
      xp = 8;
      break;
    }
  }

  const totalCoins = coins + milestoneCoins;
  save.coins += totalCoins;
  save.stats.coinsEarned += totalCoins;
  save.hints += hintsAwarded;
  save.xp += xp;
  // Player levels pay out: coins + a hint for every level gained.
  const gained = Math.max(0, playerLevelFromXp(save.xp) - levelBefore);
  const levelUpCoins = gained * LEVEL_UP_REWARD.coins;
  const levelUpHints = gained * LEVEL_UP_REWARD.hints;
  save.coins += levelUpCoins;
  save.stats.coinsEarned += levelUpCoins;
  save.hints += levelUpHints;
  const achievements = evaluateAchievements(save);

  return {
    config,
    stats,
    stars,
    score,
    bestScore,
    newBest,
    perfect,
    coins,
    xp,
    hintsAwarded,
    milestoneCoins,
    firstClear,
    achievements,
    levelUpCoins,
    levelUpHints,
    playerLevelBefore: levelBefore,
    playerLevelAfter: playerLevelFromXp(save.xp),
  };
}

/** Record an in-progress Classic game so "Continue" can resume it. */
export function recordInProgress(
  save: SaveData,
  config: PlayConfig,
  history: [number, number][],
  moves: number,
  hintsUsed: number,
  undosUsed: number,
  extra = 0,
): void {
  if (config.mode !== 'classic' || !config.level) return;
  if (!history.length && !extra) {
    if (save.inProgress?.level === config.level) save.inProgress = null;
    return;
  }
  save.inProgress = { level: config.level, history: history.slice(), moves, hintsUsed, undosUsed, extra };
}
