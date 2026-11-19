import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/data/levels';
import { MECHANIC_INTROS, planForLevel } from '../src/data/levels/levelPlan';
import { HiddenLayers } from '../src/systems/HiddenLayers';
import { findHint } from '../src/systems/HintSystem';
import { checkMove, isFrozen, PuzzleEngine } from '../src/systems/PuzzleEngine';
import { generatePuzzle } from '../src/systems/PuzzleGenerator';
import { solve, verifySolution } from '../src/systems/PuzzleSolver';
import type { PuzzleState } from '../src/types/puzzle';

describe('frozen bottles', () => {
  const board: PuzzleState = { capacity: 2, tubes: [[0, 0], [1, 2], [2, 1], [], []], locks: [0, 0, 0, 0, 2] };

  it('rejects pours into or out of a frozen container', () => {
    expect(isFrozen(board, 4)).toBe(true);
    expect(checkMove(board, 1, 4)).toEqual({ ok: false, reason: 'container-frozen' });
    expect(checkMove(board, 1, 3).ok).toBe(true);
  });

  it('thaws once enough containers are complete, and re-freezes on undo', () => {
    // [0,0] is already complete (1 of the 2 needed); pouring 2 onto 2 completes a second.
    const e = new PuzzleEngine({ capacity: 2, tubes: [[0, 0], [1, 2], [1], [2], []], locks: [0, 0, 0, 0, 2] });
    expect(e.isFrozen(4)).toBe(true);
    expect(e.pour(1, 3)).not.toBeNull(); // → [1] [1] [2,2]: two complete
    expect(e.isFrozen(4)).toBe(false);
    e.undo();
    expect(e.isFrozen(4)).toBe(true);
  });

  it('the solver respects frozen containers', () => {
    // No free empty: solvable only if the spare were usable from the start.
    const locked: PuzzleState = { capacity: 2, tubes: [[0, 1], [1, 0], []], locks: [0, 0, 1] };
    const r = solve(locked);
    expect(r.solvable).toBe(false);
    expect(r.exhausted).toBe(true);
    expect(solve({ capacity: 2, tubes: [[0, 1], [1, 0], []] }).solvable).toBe(true);
  });

  it('generated frozen puzzles verify with the frozen rules applied', () => {
    const g = generatePuzzle({ colors: 9, capacity: 4, empties: 1, seed: 4242, frozen: { count: 1, threshold: 1 } });
    expect(g.state.locks?.filter((l) => l > 0).length).toBe(1);
    expect(verifySolution(g.state, g.solution)).toBe(true);
    // The stored solution must never touch the frozen bottle before it thaws.
    const e = new PuzzleEngine(g.state);
    for (const [f, t] of g.solution) expect(e.pour(f, t)).not.toBeNull();
    expect(e.isSolved()).toBe(true);
  });

  it('hints never suggest a frozen bottle', () => {
    const l = LEVELS.find((x) => x.locks?.some((v) => v > 0))!;
    const e = new PuzzleEngine({ capacity: l.capacity, tubes: l.tubes, locks: l.locks });
    for (let i = 0; i < 80 && !e.isSolved(); i++) {
      const h = findHint(e.snapshot(), e.historyMoves);
      if (h.kind !== 'move') break;
      expect(e.isFrozen(h.from) || e.isFrozen(h.to)).toBe(false);
      e.pour(h.from, h.to);
    }
    expect(e.isSolved()).toBe(true);
  });
});

describe('extra bottle', () => {
  it('adds a usable empty container without breaking undo history', () => {
    const e = new PuzzleEngine({ capacity: 4, tubes: [[0, 1, 0, 1], [1, 0, 1, 0], []] });
    e.pour(0, 2);
    const idx = e.addContainer();
    expect(idx).toBe(3);
    expect(e.tubes[3]).toEqual([]);
    expect(e.pour(1, 3)).not.toBeNull();
    e.undo();
    e.undo();
    expect(e.tubes[0]).toEqual([0, 1, 0, 1]);
    e.restart();
    expect(e.tubes.length).toBe(4); // the bought bottle stays for restarts
  });
});

describe('hidden layers', () => {
  it('conceals all but the top unit and reveals as units surface', () => {
    const tubes = [[0, 1, 2, 3], [3, 2, 1, 0], []];
    const h = new HiddenLayers(tubes, true);
    expect(h.mask(0, 4)).toEqual([true, true, true, false]);
    expect(h.remaining).toBe(6);
    const e = new PuzzleEngine({ capacity: 4, tubes });
    e.pour(0, 2); // top of tube 0 leaves → position 2 is now the top
    const revealed = h.sync(e.tubes);
    expect(revealed).toEqual([[0, 2]]);
    expect(h.isHidden(0, 2)).toBe(false);
    expect(h.isHidden(0, 1)).toBe(true);
  });

  it('reveals are permanent across undo', () => {
    const tubes = [[0, 1, 2, 3], [3, 2, 1, 0], []];
    const h = new HiddenLayers(tubes, true);
    const e = new PuzzleEngine({ capacity: 4, tubes });
    e.pour(0, 2);
    h.sync(e.tubes);
    e.undo();
    h.sync(e.tubes);
    expect(h.isHidden(0, 2)).toBe(false);
  });

  it('disabled tracker hides nothing', () => {
    expect(new HiddenLayers([[0, 1, 2]], false).remaining).toBe(0);
  });
});

describe('chapter mechanics in the shipped levels', () => {
  it('introduces each mechanic at its intro level and uses it afterwards', () => {
    expect(LEVELS[MECHANIC_INTROS.hidden - 1].hidden).toBe(true);
    expect(LEVELS[MECHANIC_INTROS.tall - 1].capacity).toBe(5);
    expect(LEVELS[MECHANIC_INTROS.frozen - 1].locks?.some((l) => l > 0)).toBe(true);
    expect(LEVELS.filter((l) => l.id < MECHANIC_INTROS.hidden && l.hidden).length).toBe(0);
    expect(LEVELS.filter((l) => l.id < MECHANIC_INTROS.tall && l.capacity === 5).length).toBe(0);
    expect(LEVELS.filter((l) => l.id < MECHANIC_INTROS.frozen && l.locks).length).toBe(0);
    expect(LEVELS.filter((l) => l.hidden).length).toBeGreaterThan(20);
    expect(LEVELS.filter((l) => l.capacity === 5).length).toBeGreaterThanOrEqual(5);
    expect(LEVELS.filter((l) => l.locks).length).toBeGreaterThanOrEqual(10);
  });

  it('breather levels are easier than the level just before them', () => {
    const breathers = LEVELS.filter((l) => l.breather);
    expect(breathers.length).toBeGreaterThanOrEqual(10);
    let easier = 0;
    for (const b of breathers) if (b.par < LEVELS[b.id - 2].par) easier++;
    // Allow for colour-count steps; the large majority must be real breathers.
    expect(easier / breathers.length).toBeGreaterThan(0.7);
    expect(planForLevel(49).breather).toBe(true);
  });
});
