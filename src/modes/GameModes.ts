import { getLevel, LEVELS } from '../data/levels';
import { generatePuzzle } from '../systems/PuzzleGenerator';
import type { ModeId, PlayConfig } from '../types/game';
import type { SaveData } from '../types/save';
import { hashString, utcDateKey } from '../utils/random';

/**
 * A game mode turns player progress into PlayConfigs. Adding a new mode means
 * adding one object to MODES; scenes are mode-agnostic.
 */
export interface GameMode {
  id: ModeId;
  name: string;
  tagline: string;
  /** Classic level that must be completed to unlock (0 = always open). */
  unlockAfterLevel: number;
  accent: number;
  icon: string;
  start(save: SaveData, arg?: number | string): PlayConfig;
  /** Config for the next puzzle after a win, or null when the run is over. */
  next(prev: PlayConfig, save: SaveData): PlayConfig | null;
}

export function classicConfig(level: number, save?: SaveData): PlayConfig {
  const def = getLevel(level);
  const config: PlayConfig = {
    mode: 'classic',
    level,
    title: `Level ${level}`,
    subtitle: def.moveLimit ? 'Limited moves' : 'Classic',
    puzzle: { capacity: def.capacity, tubes: def.tubes.map((t) => t.slice()), ...(def.locks ? { locks: def.locks.slice() } : {}) },
    colors: def.colors,
    par: def.par,
    moveLimit: def.moveLimit,
    hidden: def.hidden,
  };
  const p = save?.inProgress;
  if (p && p.level === level && (p.history.length || p.extra)) {
    config.resume = { history: p.history.map((m) => [m[0], m[1]] as [number, number]), hintsUsed: p.hintsUsed, undosUsed: p.undosUsed, extra: p.extra ?? 0 };
  }
  return config;
}

export const ClassicMode: GameMode = {
  id: 'classic',
  name: 'Classic',
  tagline: '100 levels in five chapters',
  unlockAfterLevel: 0,
  accent: 0x9b72f2,
  icon: 'icon-play',
  start(save, arg) {
    const level = typeof arg === 'number' ? arg : Math.min(save.unlocked, LEVELS.length);
    return classicConfig(level, save);
  },
  next(prev) {
    const level = (prev.level ?? 0) + 1;
    return level <= LEVELS.length ? classicConfig(level) : null;
  },
};

export function timeStageConfig(stage: number): PlayConfig {
  const colors = Math.min(10, 3 + Math.ceil(stage / 2));
  const g = generatePuzzle({ colors, capacity: 4, empties: 2, seed: hashString(`sortopia-time-${stage}`), difficulty: 0.45, candidates: 3 });
  // Budget assumes humans need ~30% more pours than the solver's par, at a
  // per-pour time that tightens from ~4.9 s to a floor of 3.2 s by stage 15.
  const perMove = Math.max(3.2, 5 - stage * 0.12);
  return {
    mode: 'time',
    stage,
    title: `Stage ${stage}`,
    subtitle: 'Time Challenge',
    puzzle: g.state,
    colors,
    par: g.solution.length,
    timeLimit: Math.round(15 + g.solution.length * 1.3 * perMove),
  };
}

export const TimeMode: GameMode = {
  id: 'time',
  name: 'Time Challenge',
  tagline: 'Solve each stage before time runs out',
  unlockAfterLevel: 5,
  accent: 0x59b8f5,
  icon: 'icon-timer',
  start: () => timeStageConfig(1),
  next: (prev) => timeStageConfig((prev.stage ?? 1) + 1),
};

export function movesStageConfig(stage: number): PlayConfig {
  const colors = Math.min(10, 4 + Math.floor((stage - 1) / 2));
  const g = generatePuzzle({ colors, capacity: 4, empties: 2, seed: hashString(`sortopia-moves-${stage}`), difficulty: 0.5, candidates: 3 });
  const par = g.solution.length;
  return {
    mode: 'moves',
    stage,
    title: `Stage ${stage}`,
    subtitle: 'Limited Moves',
    puzzle: g.state,
    colors,
    par,
    // Slack shrinks from +42% (stage 1) to +15% (stage 10+) over the solver's par.
    moveLimit: Math.ceil(par * (1.45 - Math.min(stage, 10) * 0.03)) + 2,
  };
}

export const MovesMode: GameMode = {
  id: 'moves',
  name: 'Limited Moves',
  tagline: 'Solve each stage within a move limit',
  unlockAfterLevel: 10,
  accent: 0xff9865,
  icon: 'icon-moves',
  start: () => movesStageConfig(1),
  next: (prev) => movesStageConfig((prev.stage ?? 1) + 1),
};

/** Deterministic daily puzzle: the same UTC date yields the same board for everyone. */
export function dailyConfig(dateKey: string = utcDateKey()): PlayConfig {
  const seed = hashString(`sortopia-daily-${dateKey}`);
  const colors = 6 + (seed % 3); // 6–8 colours, varies by day
  const g = generatePuzzle({ colors, capacity: 4, empties: 2, seed, difficulty: 0.6, candidates: 4 });
  return {
    mode: 'daily',
    dateKey,
    title: 'Daily Challenge',
    subtitle: dateKey,
    puzzle: g.state,
    colors,
    par: g.solution.length,
  };
}

export const DailyMode: GameMode = {
  id: 'daily',
  name: 'Daily Challenge',
  tagline: 'One new puzzle each day',
  unlockAfterLevel: 3,
  accent: 0xffd166,
  icon: 'icon-calendar',
  start: (_save, arg) => dailyConfig(typeof arg === 'string' ? arg : utcDateKey()),
  next: () => null,
};

export function zenConfig(seed: number, solved: number): PlayConfig {
  const colors = 5 + (seed % 4); // 5–8 colours
  const g = generatePuzzle({ colors, capacity: 4, empties: 2, seed, difficulty: 0.4, candidates: 2 });
  return {
    mode: 'zen',
    stage: solved + 1,
    title: 'Zen',
    subtitle: 'Relaxed play',
    puzzle: g.state,
    colors,
    par: g.solution.length,
  };
}

export const ZenMode: GameMode = {
  id: 'zen',
  name: 'Zen Mode',
  tagline: 'No timer and no move limit',
  unlockAfterLevel: 0,
  accent: 0x62d6a5,
  icon: 'icon-leaf',
  start: (save) => zenConfig(hashString(`zen-${Date.now()}-${Math.random()}`), save.stats.zenSolved),
  next: (_prev, save) => zenConfig(hashString(`zen-${Date.now()}-${Math.random()}`), save.stats.zenSolved),
};

export const MODES: Record<ModeId, GameMode> = {
  classic: ClassicMode,
  time: TimeMode,
  moves: MovesMode,
  daily: DailyMode,
  zen: ZenMode,
};

export function isModeUnlocked(mode: GameMode, save: SaveData): boolean {
  return save.unlocked - 1 >= mode.unlockAfterLevel;
}
