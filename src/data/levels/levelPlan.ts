/**
 * Difficulty curve for the 100 Classic levels. The level build script reads
 * this plan, and the tests assert that the shipped dataset follows it.
 */
export interface LevelPlan {
  colors: number;
  capacity: number;
  empties: number;
  /** 0..1: which end of the candidate difficulty range to pick. */
  difficulty: number;
  /** Slack multiplier for move-limited levels (undefined = no limit). */
  moveLimitFactor?: number;
  /** Chapter 3+: "?" mystery layers. */
  hidden?: boolean;
  /** Chapter 5: frozen spare bottles. */
  frozen?: { count: number; threshold: number };
  /** Deliberately gentler level to pace the curve. */
  breather?: boolean;
}

/** Levels that introduce a mechanic (shown with a one-time explainer in game). */
export const MECHANIC_INTROS = { hidden: 30, tall: 52, frozen: 76 } as const;

const BREATHERS = new Set([14, 21, 28, 35, 42, 49, 57, 64, 71, 79, 85, 91, 97]);

export const LEVEL_COUNT = 100;

export interface Chapter {
  name: string;
  first: number;
  last: number;
  /** Tint used on the level map for this chapter. */
  tint: number;
}

export const CHAPTERS: Chapter[] = [
  { name: 'Crystal Lagoon', first: 1, last: 10, tint: 0x59b8f5 },
  { name: 'Candy Cove', first: 11, last: 25, tint: 0xff78b7 },
  { name: 'Lumen Grove', first: 26, last: 50, tint: 0x62d6a5 },
  { name: 'Amber Peaks', first: 51, last: 75, tint: 0xff9865 },
  { name: 'Nebula Spire', first: 76, last: 100, tint: 0x9b72f2 },
];

export function chapterFor(level: number): Chapter {
  return CHAPTERS.find((c) => level >= c.first && level <= c.last) ?? CHAPTERS[CHAPTERS.length - 1];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function planForLevel(level: number): LevelPlan {
  const plan = basePlan(level);
  if (BREATHERS.has(level)) {
    plan.breather = true;
    plan.difficulty = 0.05;
    if (plan.moveLimitFactor) plan.moveLimitFactor += 0.15;
  }
  return plan;
}

function basePlan(level: number): LevelPlan {
  if (level <= 10) {
    // Chapter 1: 3–4 colours, 4–5 containers. Gentle introduction.
    const t = (level - 1) / 9;
    if (level <= 5) return { colors: 3, capacity: 4, empties: 2, difficulty: lerp(0, 0.4, t * 2) };
    return { colors: 4, capacity: 4, empties: 1, difficulty: lerp(0, 0.35, (level - 6) / 4) };
  }
  if (level <= 25) {
    // Chapter 2: 4–5 colours; undo and hints are introduced here.
    const t = (level - 11) / 14;
    return { colors: level <= 17 ? 4 : 5, capacity: 4, empties: 2, difficulty: lerp(0.35, 0.8, t) };
  }
  if (level <= 50) {
    // Chapter 3: 5–7 colours; "?" mystery layers from level 30.
    const t = (level - 26) / 24;
    const colors = level <= 33 ? 5 : level <= 42 ? 6 : 7;
    const hidden = level >= MECHANIC_INTROS.hidden && (level === MECHANIC_INTROS.hidden || level % 3 !== 0);
    return { colors, capacity: 4, empties: 2, difficulty: lerp(0.4, 0.9, t) * (level === MECHANIC_INTROS.hidden ? 0.3 : 1), hidden };
  }
  if (level <= 75) {
    // Chapter 4: 7–9 colours; tall 5-unit bottles; limited-move challenges.
    const t = (level - 51) / 24;
    const colors = level <= 58 ? 7 : level <= 67 ? 8 : 9;
    const tall = level >= MECHANIC_INTROS.tall && (level - MECHANIC_INTROS.tall) % 4 === 0;
    const limited = level % 2 === 1 || level % 5 === 0;
    return {
      colors,
      capacity: tall ? 5 : 4,
      empties: 2,
      difficulty: lerp(0.45, 0.95, t) * (level === MECHANIC_INTROS.tall ? 0.4 : 1),
      moveLimitFactor: limited ? lerp(1.6, 1.35, t) : undefined,
      hidden: level % 3 === 0 && !tall,
    };
  }
  // Chapter 5: 9–11 colours; frozen spare bottles that thaw after a colour is sorted.
  const t = (level - 76) / 24;
  const colors = level <= 83 ? 9 : level <= 91 ? 10 : 11;
  const frozen = level % 2 === 0;
  const limited = level % 3 === 0 || level === 100;
  return {
    colors,
    capacity: 4,
    empties: frozen ? 1 : 2,
    frozen: frozen ? { count: 1, threshold: 1 } : undefined,
    difficulty: lerp(0.6, 1, t) * (level === MECHANIC_INTROS.frozen ? 0.3 : 1),
    moveLimitFactor: limited ? lerp(1.4, 1.25, t) : undefined,
    hidden: !frozen && level % 3 !== 0 && level > 77,
  };
}

/** Move limit derived from a verified solution length. Always ≥ par, so it is always achievable. */
export function moveLimitFor(par: number, factor: number): number {
  return Math.max(par, Math.ceil(par * factor) + 2);
}
