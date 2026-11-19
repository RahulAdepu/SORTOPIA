/**
 * Independently re-verifies the shipped level set: structure, stored solution,
 * fresh solver run, and move-limit fairness. Exits non-zero on any problem.
 *
 *   npm run levels:validate
 */
import { LEVELS } from '../src/data/levels';
import { isTubeComplete, validateStructure } from '../src/systems/PuzzleEngine';
import { solve, verifySolution } from '../src/systems/PuzzleSolver';

let failures = 0;
for (const l of LEVELS) {
  const state = { capacity: l.capacity, tubes: l.tubes, locks: l.locks };
  const problems = validateStructure(state, l.colors);
  if (!verifySolution(state, l.solution)) problems.push('stored solution does not solve the level');
  if (l.par !== l.solution.length) problems.push('par != solution length');
  if (l.moveLimit !== undefined && l.moveLimit < l.par) problems.push('move limit below par');
  if (l.tubes.some((t) => isTubeComplete(t, l.capacity))) problems.push('starts with a completed container');
  const r = solve(state, { maxNodes: 300_000 });
  if (!r.solvable) problems.push('runtime solver could not solve it');
  if (problems.length) {
    failures++;
    console.error(`Level ${l.id}: ${problems.join('; ')}`);
  }
}
console.log(`${LEVELS.length} levels checked, ${failures} failing.`);
process.exit(failures ? 1 : 0);
