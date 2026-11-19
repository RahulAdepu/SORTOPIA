/**
 * Builds src/data/levels/levels.json, the curated, pre-validated Classic level set.
 *
 *   npm run levels:generate
 *
 * Every level is produced by the deterministic generator, solved, and its
 * solution replayed to prove it is winnable. Move limits are derived from the
 * verified solution length so a limited level can never be impossible.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePuzzle } from '../src/systems/PuzzleGenerator';
import { solveBest, verifySolution } from '../src/systems/PuzzleSolver';
import { LEVEL_COUNT, moveLimitFor, planForLevel } from '../src/data/levels/levelPlan';
import { CURATED_LEVELS } from '../src/data/levels/curated';
import type { LevelDefinition } from '../src/types/puzzle';
import { hashString } from '../src/utils/random';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/data/levels/levels.json');

const levels: LevelDefinition[] = [];
const started = Date.now();

for (let id = 1; id <= LEVEL_COUNT; id++) {
  const plan = planForLevel(id);
  const curated = CURATED_LEVELS[id];
  let tubes: number[][];
  let seed = 0;
  let locks: number[] | undefined;
  if (curated) {
    tubes = curated.map((t) => t.slice());
  } else {
    seed = hashString(`sortopia-classic-${id}`);
    const g = generatePuzzle({
      colors: plan.colors,
      capacity: plan.capacity,
      empties: plan.empties,
      seed,
      // More candidates = finer control over where each level sits on the curve.
      candidates: plan.colors <= 4 ? 14 : 10,
      difficulty: plan.difficulty,
      maxNodes: 120_000,
      frozen: plan.frozen,
    });
    tubes = g.state.tubes;
    locks = g.state.locks;
  }
  const state = { tubes, capacity: plan.capacity, locks };
  const best = solveBest(state, 250_000);
  if (!best.solvable || !verifySolution(state, best.solution)) {
    throw new Error(`Level ${id} failed verification`);
  }
  const par = best.solution.length;
  const def: LevelDefinition = {
    id,
    colors: plan.colors,
    capacity: plan.capacity,
    tubes,
    par,
    seed,
    solution: best.solution,
  };
  if (plan.moveLimitFactor) def.moveLimit = moveLimitFor(par, plan.moveLimitFactor);
  if (locks) def.locks = locks;
  if (plan.hidden) def.hidden = true;
  if (plan.breather) def.breather = true;
  levels.push(def);
  process.stdout.write(`L${id}: ${plan.colors}c ${tubes.length}t par ${par}${def.moveLimit ? ` limit ${def.moveLimit}` : ''}\n`);
}

writeFileSync(out, JSON.stringify(levels));
console.log(`Wrote ${levels.length} levels to ${out} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
