import type { PuzzleState, Tube } from '../types/puzzle';
import { SeededRandom } from '../utils/random';
import { isTubeComplete, validateStructure } from './PuzzleEngine';
import { solve, verifySolution } from './PuzzleSolver';

export interface GeneratorSpec {
  colors: number;
  capacity: number;
  empties: number;
  seed: number;
  /** How many solvable candidates to compare. More = finer difficulty control. */
  candidates?: number;
  /** 0 = pick the easiest candidate, 1 = pick the hardest. */
  difficulty?: number;
  /** Node budget per solve attempt. */
  maxNodes?: number;
  /** Max fraction of units allowed to already sit in a same-colour run at the start (lower = more scrambled). */
  maxPresorted?: number;
  /** Frozen spare bottles appended after the free empties; each thaws after `threshold` completions. */
  frozen?: { count: number; threshold: number };
}

export interface GeneratedPuzzle {
  state: PuzzleState;
  solution: [number, number][];
  /** Difficulty score (higher = harder). */
  score: number;
  seed: number;
}

/** Fraction of adjacent unit pairs that already match: a measure of how "pre-sorted" a board is. */
export function presortedRatio(tubes: readonly Tube[]): number {
  let pairs = 0;
  let same = 0;
  for (const t of tubes) {
    for (let i = 1; i < t.length; i++) {
      pairs++;
      if (t[i] === t[i - 1]) same++;
    }
  }
  return pairs ? same / pairs : 0;
}

/** Deal a shuffled board. Colour units are spread over `colors` full tubes, followed by empty tubes. */
export function dealBoard(rng: SeededRandom, colors: number, capacity: number, empties: number): Tube[] {
  const units: number[] = [];
  for (let c = 0; c < colors; c++) for (let i = 0; i < capacity; i++) units.push(c);
  rng.shuffle(units);
  const tubes: Tube[] = [];
  for (let i = 0; i < colors; i++) tubes.push(units.slice(i * capacity, (i + 1) * capacity));
  for (let i = 0; i < empties; i++) tubes.push([]);
  return tubes;
}

function difficultyScore(solutionLength: number, expanded: number, presorted: number): number {
  return solutionLength * 10 + Math.log2(1 + expanded) * 4 + (1 - presorted) * 10;
}

/**
 * Generate a puzzle that is guaranteed solvable: every candidate is solved by
 * the solver and the solution is replayed to verify it before being returned.
 * Deterministic for a given spec.
 */
export function generatePuzzle(spec: GeneratorSpec): GeneratedPuzzle {
  const candidatesWanted = Math.max(1, spec.candidates ?? 4);
  const difficulty = Math.min(1, Math.max(0, spec.difficulty ?? 0.5));
  const maxNodes = spec.maxNodes ?? 60_000;
  const maxPresorted = spec.maxPresorted ?? 0.34;
  const rng = new SeededRandom(spec.seed);
  const found: GeneratedPuzzle[] = [];

  for (let attempt = 0; attempt < 400 && found.length < candidatesWanted; attempt++) {
    const tubes = dealBoard(rng, spec.colors, spec.capacity, spec.empties);
    // Reject boards that start with a finished container or are too pre-sorted.
    if (tubes.some((t) => isTubeComplete(t, spec.capacity))) continue;
    const presorted = presortedRatio(tubes);
    if (presorted > maxPresorted && attempt < 300) continue;
    const state: PuzzleState = { tubes, capacity: spec.capacity };
    if (spec.frozen && spec.frozen.count > 0) {
      const locks = tubes.map(() => 0);
      for (let i = 0; i < spec.frozen.count; i++) {
        tubes.push([]);
        locks.push(spec.frozen.threshold);
      }
      state.locks = locks;
    }
    const result = solve(state, { maxNodes, weight: 2 });
    if (!result.solvable || !verifySolution(state, result.solution)) continue;
    found.push({
      state,
      solution: result.solution,
      score: difficultyScore(result.solution.length, result.expanded, presorted),
      seed: spec.seed,
    });
  }

  if (!found.length) {
    throw new Error(`Could not generate a solvable puzzle for ${JSON.stringify(spec)}`);
  }
  found.sort((a, b) => a.score - b.score);
  const pick = found[Math.round(difficulty * (found.length - 1))];
  const problems = validateStructure(pick.state, spec.colors);
  if (problems.length) throw new Error(`Generated puzzle failed validation: ${problems.join(', ')}`);
  return pick;
}
