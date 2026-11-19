export const SAVE_VERSION = 1;

export interface LevelRecord {
  stars: number;
  bestScore: number;
  bestMoves: number;
  perfect: boolean;
}

export interface Settings {
  /** 0..1 */
  music: number;
  /** 0..1 */
  sfx: number;
  haptics: boolean;
  /** Draws a unique symbol on every colour for colour-vision accessibility. */
  colorSymbols: boolean;
  reducedMotion: boolean;
  /** Larger text and stronger outlines. */
  largeText: boolean;
}

/** An in-progress Classic game, stored as a replayable move list. */
export interface InProgressGame {
  level: number;
  history: [number, number][];
  /** Extra Bottle power-ups used (re-applied before replaying history). */
  extra?: number;
  moves: number;
  hintsUsed: number;
  undosUsed: number;
}

export interface DailyState {
  /** UTC date key of the most recent completion. */
  lastCompleted: string | null;
  streak: number;
  bestStreak: number;
  /** Recent completion keys (bounded list). */
  history: string[];
  totalCompleted: number;
}

export interface Stats {
  levelsCompleted: number;
  perfects: number;
  totalMoves: number;
  hintsUsed: number;
  undosUsed: number;
  coinsEarned: number;
  zenSolved: number;
  timeBestStage: number;
  movesBestStage: number;
  tubesCompleted: number;
}

export interface SaveData {
  version: number;
  coins: number;
  hints: number;
  xp: number;
  /** Highest Classic level the player may start. */
  unlocked: number;
  /** Classic level records keyed by level number. */
  levels: Record<string, LevelRecord>;
  /** Score dimension reported to YouTube; must equal the best score in the save. */
  bestTotalScore: number;
  daily: DailyState;
  stats: Stats;
  /** Achievement id → unix ms when unlocked. */
  achievements: Record<string, number>;
  /** Classic milestone chests already claimed (level numbers). */
  milestones: number[];
  settings: Settings;
  inProgress: InProgressGame | null;
  /** One-time tutorial / feature-introduction flags. */
  seen: Record<string, boolean>;
  /** Cosmetics bought with coins or unlocked with stars, and what is equipped. */
  cosmetics: { owned: string[]; bottle: string; palette: string };
  /** Consumable power-ups. */
  items: { extraBottles: number };
}

export function defaultSettings(): Settings {
  return { music: 0.6, sfx: 0.85, haptics: true, colorSymbols: false, reducedMotion: false, largeText: false };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 50,
    hints: 3,
    xp: 0,
    unlocked: 1,
    levels: {},
    bestTotalScore: 0,
    daily: { lastCompleted: null, streak: 0, bestStreak: 0, history: [], totalCompleted: 0 },
    stats: {
      levelsCompleted: 0,
      perfects: 0,
      totalMoves: 0,
      hintsUsed: 0,
      undosUsed: 0,
      coinsEarned: 0,
      zenSolved: 0,
      timeBestStage: 0,
      movesBestStage: 0,
      tubesCompleted: 0,
    },
    achievements: {},
    milestones: [],
    settings: defaultSettings(),
    inProgress: null,
    seen: {},
    cosmetics: { owned: ['bottle:classic', 'palette:classic'], bottle: 'classic', palette: 'classic' },
    items: { extraBottles: 1 },
  };
}
