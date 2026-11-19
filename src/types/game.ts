import type { PuzzleState } from './puzzle';

export type ModeId = 'classic' | 'time' | 'moves' | 'daily' | 'zen';

/** Everything GameScene needs to run one puzzle. Produced by a GameMode. */
export interface PlayConfig {
  mode: ModeId;
  /** Classic level number. */
  level?: number;
  /** Stage number for ladder modes (Time Challenge / Limited Moves). */
  stage?: number;
  /** UTC date key for the Daily Challenge. */
  dateKey?: string;
  title: string;
  subtitle: string;
  puzzle: PuzzleState;
  colors: number;
  /** Verified solution length. */
  par: number;
  moveLimit?: number;
  /** "?" mystery layers (all but each container's top start concealed). */
  hidden?: boolean;
  /** Seconds. */
  timeLimit?: number;
  /** Resume an in-progress Classic game. */
  resume?: { history: [number, number][]; hintsUsed: number; undosUsed: number; extra?: number };
}

/** Statistics gathered while playing one puzzle. */
export interface PlayStats {
  moves: number;
  hintsUsed: number;
  undosUsed: number;
  /** Extra Bottle boosts used (caps the result at 2 stars). */
  extraUsed?: number;
  /** Seconds elapsed. */
  elapsed: number;
  /** Seconds left (time-limited modes only). */
  timeLeft?: number;
}

export type LossReason = 'time' | 'moves';

/** Outcome of a won puzzle, after rewards are applied. */
export interface LevelResult {
  config: PlayConfig;
  stats: PlayStats;
  stars: number;
  score: number;
  bestScore: number;
  newBest: boolean;
  perfect: boolean;
  coins: number;
  xp: number;
  hintsAwarded: number;
  /** Extra coins from a milestone chest, if any. */
  milestoneCoins: number;
  firstClear: boolean;
  achievements: string[];
  /** Coins and hints granted for player levels gained by this win. */
  levelUpCoins: number;
  levelUpHints: number;
  /** Player level before/after (for level-up celebration). */
  playerLevelBefore: number;
  playerLevelAfter: number;
}
