import type { LevelDefinition } from '../../types/puzzle';
import raw from './levels.json';

/** The 100 shipped Classic levels (generated + verified by scripts/generate-levels.ts). */
export const LEVELS: readonly LevelDefinition[] = raw as LevelDefinition[];

export function getLevel(id: number): LevelDefinition {
  const level = LEVELS[id - 1];
  if (!level || level.id !== id) throw new Error(`Unknown level ${id}`);
  return level;
}
