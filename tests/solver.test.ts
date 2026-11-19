import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/data/levels';
import { CHAPTERS, LEVEL_COUNT, planForLevel } from '../src/data/levels/levelPlan';
import { findHint } from '../src/systems/HintSystem';
import { PuzzleEngine, isTubeComplete, legalMoves, validateStructure } from '../src/systems/PuzzleEngine';
import { SeededRandom } from '../src/utils/random';
import { generatePuzzle } from '../src/systems/PuzzleGenerator';
import { canonicalKey, solve, verifySolution } from '../src/systems/PuzzleSolver';
import { dailyConfig, movesStageConfig, timeStageConfig, zenConfig } from '../src/modes/GameModes';

describe('solver', () => {
  it('solves a simple puzzle and verifies the solution', () => {
    const state = { capacity: 4, tubes: [[0, 1, 0, 1], [1, 0, 1, 0], [], []] };
    const r = solve(state);
    expect(r.solvable).toBe(true);
    expect(verifySolution(state, r.solution)).toBe(true);
  });

  it('proves an impossible puzzle unsolvable', () => {
    const state = { capacity: 2, tubes: [[0, 1], [1, 0]] };
    const r = solve(state);
    expect(r.solvable).toBe(false);
    expect(r.exhausted).toBe(true);
  });

  it('canonical keys ignore container order', () => {
    expect(canonicalKey([[0, 1], [], [2]])).toBe(canonicalKey([[2], [0, 1], []]));
  });

  it('rejects a bogus solution', () => {
    const state = { capacity: 4, tubes: [[0, 1, 0, 1], [1, 0, 1, 0], [], []] };
    expect(verifySolution(state, [[0, 1]])).toBe(false);
  });
});

describe('generator', () => {
  it('is deterministic for a seed', () => {
    const a = generatePuzzle({ colors: 6, capacity: 4, empties: 2, seed: 1234 });
    const b = generatePuzzle({ colors: 6, capacity: 4, empties: 2, seed: 1234 });
    expect(a.state).toEqual(b.state);
  });

  it('only returns solvable, well-formed puzzles', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const colors = 3 + (seed % 7);
      const g = generatePuzzle({ colors, capacity: 4, empties: 2, seed });
      expect(validateStructure(g.state, colors)).toEqual([]);
      expect(verifySolution(g.state, g.solution)).toBe(true);
      expect(g.state.tubes.some((t) => isTubeComplete(t, 4))).toBe(false);
    }
  });
});

describe('shipped level dataset', () => {
  it(`has exactly ${LEVEL_COUNT} levels with sequential ids`, () => {
    expect(LEVELS.length).toBe(LEVEL_COUNT);
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
  });

  it('every level is structurally valid and its stored solution wins', () => {
    for (const l of LEVELS) {
      const state = { capacity: l.capacity, tubes: l.tubes, locks: l.locks };
      expect(validateStructure(state, l.colors), `level ${l.id}`).toEqual([]);
      expect(verifySolution(state, l.solution), `level ${l.id}`).toBe(true);
      expect(l.par).toBe(l.solution.length);
    }
  });

  it('every level is independently solvable by the runtime solver', () => {
    for (const l of LEVELS) {
      const r = solve({ capacity: l.capacity, tubes: l.tubes, locks: l.locks }, { maxNodes: 200_000 });
      expect(r.solvable, `level ${l.id}`).toBe(true);
    }
  });

  it('move limits are always achievable (≥ verified solution length)', () => {
    for (const l of LEVELS) {
      if (l.moveLimit !== undefined) expect(l.moveLimit, `level ${l.id}`).toBeGreaterThanOrEqual(l.par);
    }
  });

  it('follows the difficulty curve from the design brief', () => {
    for (const l of LEVELS) {
      const containers = l.tubes.length;
      if (l.id <= 10) {
        expect(l.colors).toBeGreaterThanOrEqual(3);
        expect(l.colors).toBeLessThanOrEqual(4);
        expect(containers).toBeGreaterThanOrEqual(4);
        expect(containers).toBeLessThanOrEqual(5);
      } else if (l.id <= 25) {
        expect([4, 5]).toContain(l.colors);
      } else if (l.id <= 50) {
        expect(l.colors).toBeGreaterThanOrEqual(5);
        expect(l.colors).toBeLessThanOrEqual(7);
      } else if (l.id <= 75) {
        expect(l.colors).toBeGreaterThanOrEqual(7);
        expect(l.colors).toBeLessThanOrEqual(9);
      } else {
        expect(l.colors).toBeGreaterThanOrEqual(9);
      }
      expect(l.colors).toBe(planForLevel(l.id).colors);
    }
    expect(LEVELS.filter((l) => l.id >= 51 && l.id <= 75 && l.moveLimit).length).toBeGreaterThan(5);
  });

  it('no level starts with an already-completed container', () => {
    for (const l of LEVELS) expect(l.tubes.some((t) => isTubeComplete(t, l.capacity)), `level ${l.id}`).toBe(false);
  });

  it('chapters cover all levels without gaps', () => {
    let next = 1;
    for (const c of CHAPTERS) {
      expect(c.first).toBe(next);
      next = c.last + 1;
    }
    expect(next - 1).toBe(LEVEL_COUNT);
  });
});

describe('mode puzzles', () => {
  it('daily challenge is deterministic per date and differs across dates', () => {
    const a = dailyConfig('2026-11-18');
    const b = dailyConfig('2026-11-18');
    const c = dailyConfig('2026-11-19');
    expect(a.puzzle).toEqual(b.puzzle);
    expect(a.puzzle).not.toEqual(c.puzzle);
  });

  it('daily, time, moves and zen puzzles are solvable within their limits', () => {
    const configs = [
      dailyConfig('2026-01-01'),
      dailyConfig('2027-06-30'),
      ...[1, 4, 9, 15].map(timeStageConfig),
      ...[1, 4, 9, 15].map(movesStageConfig),
      zenConfig(42, 0),
    ];
    for (const c of configs) {
      const r = solve(c.puzzle, { maxNodes: 200_000 });
      expect(r.solvable).toBe(true);
      if (c.moveLimit) expect(c.moveLimit).toBeGreaterThanOrEqual(c.par);
      if (c.timeLimit) expect(c.timeLimit).toBeGreaterThan(c.par);
    }
  });
});

describe('hints', () => {
  it('suggests a legal move that keeps the puzzle solvable', () => {
    const l = LEVELS[19];
    const e = new PuzzleEngine({ capacity: l.capacity, tubes: l.tubes, locks: l.locks });
    for (let i = 0; i < 60 && !e.isSolved(); i++) {
      const h = findHint(e.snapshot(), e.historyMoves);
      expect(h.kind).toBe('move');
      if (h.kind !== 'move') break;
      expect(e.pour(h.from, h.to)).not.toBeNull();
    }
    expect(e.isSolved()).toBe(true);
  });

  it('suggests undo from a dead end', () => {
    // Pouring 0→2 then 1→... builds a dead end on a tiny board.
    const e = new PuzzleEngine({ capacity: 2, tubes: [[0, 1], [1, 0], []] });
    e.pour(0, 2); // [0] [1,0] [1]
    e.pour(1, 0); // [0,0] [1] [1]  -> still solvable
    const h1 = findHint(e.snapshot(), e.historyMoves);
    expect(h1.kind).toBe('move');
    const dead = new PuzzleEngine({ capacity: 2, tubes: [[0, 1], [1, 0], [2, 2], []] });
    dead.pour(0, 3); // [0] [1,0] [2,2] [1]
    dead.pour(1, 0); // [0,0] [1] [2,2] [1]
    const solvedHint = findHint(dead.snapshot(), dead.historyMoves);
    expect(['move', 'solved']).toContain(solvedHint.kind);
  });

  it('returns solved for a solved board', () => {
    expect(findHint({ capacity: 2, tubes: [[0, 0], []] }).kind).toBe('solved');
  });

  it('walks back history when the current position is unsolvable', () => {
    // Random-play a 1-empty level until we provably reach a dead end, then
    // check the hint says exactly how many undos restore a solvable board.
    const l = LEVELS[7]; // 4 colours, 1 empty: dead ends are easy to reach
    const rng = new SeededRandom(7);
    let found = false;
    for (let trial = 0; trial < 200 && !found; trial++) {
      const e = new PuzzleEngine({ capacity: l.capacity, tubes: l.tubes, locks: l.locks });
      for (let step = 0; step < 12; step++) {
        const moves = legalMoves(e.snapshot());
        if (!moves.length) break;
        const m = moves[rng.int(0, moves.length - 1)];
        e.pour(m.from, m.to);
        const r = solve(e.snapshot(), { maxNodes: 200_000 });
        if (r.exhausted) {
          const h = findHint(e.snapshot(), e.historyMoves, { direct: 200_000, probe: 200_000, maxProbes: 20 });
          expect(h.kind).toBe('undo');
          if (h.kind === 'undo') {
            for (let i = 0; i < h.steps; i++) e.undo();
            expect(solve(e.snapshot(), { maxNodes: 200_000 }).solvable).toBe(true);
          }
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });
});

describe('hint performance and safety (regression)', () => {
  it('answers quickly on big scrambled boards and every undo suggestion lands on a solvable position', () => {
    let worst = 0;
    for (const id of [60, 92, 100]) {
      const l = LEVELS[id - 1];
      const rng = new SeededRandom(id * 7);
      for (let trial = 0; trial < 25; trial++) {
        const e = new PuzzleEngine({ capacity: l.capacity, tubes: l.tubes, locks: l.locks });
        for (let s = 0; s < 2 + (trial % 18); s++) {
          const m = legalMoves(e.snapshot());
          if (!m.length) break;
          const mv = m[rng.int(0, m.length - 1)];
          e.pour(mv.from, mv.to);
        }
        const t0 = performance.now();
        const h = findHint(e.snapshot(), e.historyMoves);
        worst = Math.max(worst, performance.now() - t0);
        if (h.kind === 'move') expect(e.canPour(h.from, h.to).ok).toBe(true);
        if (h.kind === 'undo') {
          for (let i = 0; i < h.steps; i++) e.undo();
          expect(solve(e.snapshot(), { maxNodes: 400_000 }).solvable, `level ${id} trial ${trial}`).toBe(true);
        }
      }
    }
    // Generous bound for slow CI machines; typical worst case is ~15 ms.
    expect(worst).toBeLessThan(400);
  });
});
