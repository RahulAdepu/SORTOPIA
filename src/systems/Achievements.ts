import type { SaveData } from '../types/save';
import { BOTTLE_STYLES } from '../data/catalog';

export type AchievementCategory = 'progress' | 'mastery' | 'daily' | 'challenge';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  /** Coin reward granted on unlock. */
  reward: number;
  target: number;
  progress(save: SaveData): number;
}

export function totalStars(save: SaveData): number {
  return Object.values(save.levels).reduce((a, l) => a + l.stars, 0);
}

export function levelsCompleted(save: SaveData): number {
  return Object.keys(save.levels).length;
}

const lv = (save: SaveData) => levelsCompleted(save);
const pf = (save: SaveData) => save.stats.perfects;
const st = (save: SaveData) => totalStars(save);
const streak = (save: SaveData) => save.daily.bestStreak;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-sort', title: 'First Sort', description: 'Complete your first level', category: 'progress', reward: 25, target: 1, progress: lv },
  { id: 'levels-10', title: 'Lagoon Explorer', description: 'Complete 10 levels', category: 'progress', reward: 60, target: 10, progress: lv },
  { id: 'levels-25', title: 'Candy Connoisseur', description: 'Complete 25 levels', category: 'progress', reward: 120, target: 25, progress: lv },
  { id: 'levels-50', title: 'Grove Guardian', description: 'Complete 50 levels', category: 'progress', reward: 250, target: 50, progress: lv },
  { id: 'levels-100', title: 'Master of Sortopia', description: 'Complete all 100 levels', category: 'progress', reward: 1000, target: 100, progress: lv },
  { id: 'perfect-1', title: 'Flawless', description: 'Earn a perfect solution (3 stars, no undo, no hint)', category: 'mastery', reward: 30, target: 1, progress: pf },
  { id: 'perfect-10', title: 'Precision Pourer', description: 'Earn 10 perfect solutions', category: 'mastery', reward: 120, target: 10, progress: pf },
  { id: 'perfect-30', title: 'Alchemist', description: 'Earn 30 perfect solutions', category: 'mastery', reward: 300, target: 30, progress: pf },
  { id: 'stars-50', title: 'Star Collector', description: 'Collect 50 stars', category: 'mastery', reward: 60, target: 50, progress: st },
  { id: 'stars-150', title: 'Constellation', description: 'Collect 150 stars', category: 'mastery', reward: 180, target: 150, progress: st },
  { id: 'stars-300', title: 'Supernova', description: 'Collect all 300 stars', category: 'mastery', reward: 800, target: 300, progress: st },
  { id: 'daily-1', title: 'Daily Dabbler', description: 'Complete a Daily Challenge', category: 'daily', reward: 30, target: 1, progress: (s) => s.daily.totalCompleted },
  { id: 'streak-3', title: 'On a Roll', description: 'Reach a 3-day daily streak', category: 'daily', reward: 75, target: 3, progress: streak },
  { id: 'streak-7', title: 'Weekly Ritual', description: 'Reach a 7-day daily streak', category: 'daily', reward: 200, target: 7, progress: streak },
  { id: 'streak-30', title: 'Devotee', description: 'Reach a 30-day daily streak', category: 'daily', reward: 1000, target: 30, progress: streak },
  { id: 'time-5', title: 'Quick Hands', description: 'Clear stage 5 in Time Challenge', category: 'challenge', reward: 80, target: 5, progress: (s) => s.stats.timeBestStage },
  { id: 'time-12', title: 'Speed Alchemist', description: 'Clear stage 12 in Time Challenge', category: 'challenge', reward: 250, target: 12, progress: (s) => s.stats.timeBestStage },
  { id: 'moves-5', title: 'Economist', description: 'Clear stage 5 in Limited Moves', category: 'challenge', reward: 80, target: 5, progress: (s) => s.stats.movesBestStage },
  { id: 'moves-12', title: 'Grandmaster', description: 'Clear stage 12 in Limited Moves', category: 'challenge', reward: 250, target: 12, progress: (s) => s.stats.movesBestStage },
  { id: 'zen-10', title: 'Inner Calm', description: 'Solve 10 puzzles in Zen Mode', category: 'challenge', reward: 60, target: 10, progress: (s) => s.stats.zenSolved },
  {
    id: 'collector',
    title: 'Collector',
    description: 'Own 3 bottle styles',
    category: 'mastery',
    reward: 100,
    target: 3,
    progress: (s) => BOTTLE_STYLES.filter((b) => s.cosmetics.owned.includes(`bottle:${b.id}`)).length,
  },
  { id: 'tubes-200', title: 'Bottled Up', description: 'Complete 200 containers', category: 'mastery', reward: 100, target: 200, progress: (s) => s.stats.tubesCompleted },
];

/** Unlock every achievement whose target is met, granting coin rewards. Returns new ids. */
export function evaluateAchievements(save: SaveData, now = Date.now()): string[] {
  const unlocked: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id]) continue;
    if (a.progress(save) >= a.target) {
      save.achievements[a.id] = now;
      save.coins += a.reward;
      save.stats.coinsEarned += a.reward;
      unlocked.push(a.id);
    }
  }
  return unlocked;
}

export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
