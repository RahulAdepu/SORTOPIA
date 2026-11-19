import type { Move, PuzzleState } from '../types/puzzle';
import { cloneState, isSolved, revertMoveInPlace } from './PuzzleEngine';
import { solve } from './PuzzleSolver';

export type Hint =
  | { kind: 'move'; from: number; to: number }
  /** Current position is a dead end; undo this many moves to get back on a solvable path. */
  | { kind: 'undo'; steps: number }
  | { kind: 'restart' }
  | { kind: 'solved' };

export interface HintBudget {
  direct: number;
  probe: number;
  maxProbes: number;
}

/** Node budgets keep a hint well under a frame-budget-friendly time even on 13-container boards. */
export const HINT_BUDGET: Readonly<HintBudget> = { direct: 12_000, probe: 4_000, maxProbes: 7 };

/**
 * Find the most helpful next action.
 *
 * 1. Search for a solution from the current board (greedy, bounded).
 * 2. Otherwise find how far back the player went wrong. Solvability along a
 *    play history is monotonic: if a position is solvable, so is every
 *    earlier one (the later moves are a path from it). So the last solvable
 *    position can be found by BINARY search over the history (start = solvable).
 *    Inconclusive probes are treated as unsolvable, so we never send the player
 *    into another dead end.
 */
export function findHint(state: PuzzleState, history: readonly Move[] = [], budget: HintBudget = HINT_BUDGET): Hint {
  if (isSolved(state)) return { kind: 'solved' };
  const direct = solve(state, { maxNodes: budget.direct, weight: 3 });
  if (direct.solvable && direct.solution.length) {
    const [from, to] = direct.solution[0];
    return { kind: 'move', from, to };
  }
  if (!history.length) return { kind: 'restart' };

  // states[k] = position after the first k moves of history (k = 0 … n).
  const n = history.length;
  const positionAfter = (k: number): PuzzleState => {
    const p: PuzzleState = cloneState(state);
    for (let i = n - 1; i >= k; i--) revertMoveInPlace(p, history[i]);
    return p;
  };
  // Invariant: lo is known/assumed solvable (0 = puzzle start), hi is not (n = now).
  let lo = 0;
  let hi = n;
  let probes = 0;
  while (hi - lo > 1 && probes < budget.maxProbes) {
    const mid = (lo + hi) >> 1;
    probes++;
    if (solve(positionAfter(mid), { maxNodes: budget.probe, weight: 3 }).solvable) lo = mid;
    else hi = mid;
  }
  if (lo === 0) return n <= 12 ? { kind: 'undo', steps: n } : { kind: 'restart' };
  return { kind: 'undo', steps: n - lo };
}
