import { describe, expect, it } from 'vitest';
import {
  checkMove,
  hasUsefulMove,
  isSolved,
  isTubeComplete,
  PuzzleEngine,
  topRunLength,
  validateStructure,
} from '../src/systems/PuzzleEngine';
import type { PuzzleState } from '../src/types/puzzle';

const board = (tubes: number[][], capacity = 4): PuzzleState => ({ tubes, capacity });

describe('move validation', () => {
  it('allows pouring into an empty container', () => {
    const r = checkMove(board([[0, 1], []]), 0, 1);
    expect(r).toEqual({ ok: true, count: 1, color: 1 });
  });

  it('allows pouring onto a matching top colour', () => {
    const r = checkMove(board([[0, 1], [2, 1]]), 0, 1);
    expect(r.ok).toBe(true);
  });

  it('rejects mismatched colours', () => {
    expect(checkMove(board([[0, 1], [2]]), 0, 1)).toEqual({ ok: false, reason: 'color-mismatch' });
  });

  it('rejects pouring from an empty container', () => {
    expect(checkMove(board([[], [1]]), 0, 1)).toEqual({ ok: false, reason: 'source-empty' });
  });

  it('rejects pouring into a full container', () => {
    expect(checkMove(board([[1], [1, 1, 1, 1]]), 0, 1)).toEqual({ ok: false, reason: 'destination-full' });
  });

  it('rejects same-container and out-of-range moves', () => {
    expect(checkMove(board([[1], []]), 0, 0)).toEqual({ ok: false, reason: 'same-container' });
    expect(checkMove(board([[1], []]), 0, 5)).toEqual({ ok: false, reason: 'out-of-range' });
    expect(checkMove(board([[1], []]), -1, 1)).toEqual({ ok: false, reason: 'out-of-range' });
  });

  it('rejects pouring out of a completed container', () => {
    expect(checkMove(board([[2, 2, 2, 2], []]), 0, 1)).toEqual({ ok: false, reason: 'source-complete' });
  });
});

describe('container capacity', () => {
  it('pours the whole top run when it fits', () => {
    const e = new PuzzleEngine(board([[0, 1, 1, 1], [], [1]]));
    const m = e.pour(0, 1);
    expect(m?.count).toBe(3);
    expect(e.tubes[1]).toEqual([1, 1, 1]);
    expect(e.tubes[0]).toEqual([0]);
  });

  it('never exceeds destination capacity (partial pour)', () => {
    const e = new PuzzleEngine(board([[0, 1, 1, 1], [2, 2, 1], [0, 0, 0, 2]]));
    const m = e.pour(0, 1);
    expect(m?.count).toBe(1);
    expect(e.tubes[1].length).toBe(4);
    expect(e.tubes[0]).toEqual([0, 1, 1]);
  });

  it('computes the top run length', () => {
    expect(topRunLength([0, 1, 1])).toBe(2);
    expect(topRunLength([])).toBe(0);
    expect(topRunLength([3, 3, 3, 3])).toBe(4);
  });
});

describe('completion detection', () => {
  it('detects completed containers', () => {
    expect(isTubeComplete([1, 1, 1, 1], 4)).toBe(true);
    expect(isTubeComplete([1, 1, 1], 4)).toBe(false);
    expect(isTubeComplete([1, 1, 2, 1], 4)).toBe(false);
  });

  it('detects puzzle completion', () => {
    expect(isSolved(board([[0, 0, 0, 0], [], [1, 1, 1, 1]]))).toBe(true);
    expect(isSolved(board([[0, 0, 0, 0], [1], [1, 1, 1]]))).toBe(false);
  });

  it('solves a full game through the engine', () => {
    const e = new PuzzleEngine(board([[0, 0, 0, 1], [1, 1, 1, 2], [2, 2, 2, 0], []]));
    expect(e.pour(2, 3)).not.toBeNull();
    expect(e.pour(1, 2)).not.toBeNull();
    expect(e.pour(0, 1)).not.toBeNull();
    expect(e.isSolved()).toBe(false);
    expect(e.pour(3, 0)).not.toBeNull();
    expect(e.isSolved()).toBe(true);
    expect(e.moves).toBe(4);
    expect(e.completedCount()).toBe(3);
  });
});

describe('undo and restart', () => {
  it('undo restores exactly the previous state', () => {
    const start = board([[0, 1, 1], [1], [0, 0, 0]]);
    const e = new PuzzleEngine(start);
    const before = e.snapshot();
    e.pour(0, 1);
    expect(e.moves).toBe(1);
    const m = e.undo();
    expect(m).not.toBeNull();
    expect(e.snapshot()).toEqual(before);
    expect(e.moves).toBe(0);
  });

  it('undo with no history is a no-op', () => {
    const e = new PuzzleEngine(board([[0], []]));
    expect(e.undo()).toBeNull();
  });

  it('multiple undos unwind in order', () => {
    const e = new PuzzleEngine(board([[0, 1], [1], [], [0]], 2));
    const s0 = e.snapshot();
    e.pour(0, 1);
    const s1 = e.snapshot();
    e.pour(0, 3);
    e.undo();
    expect(e.snapshot()).toEqual(s1);
    e.undo();
    expect(e.snapshot()).toEqual(s0);
  });

  it('restart resets board, history and moves', () => {
    const e = new PuzzleEngine(board([[0, 1, 1], [1], [0, 0, 0]]));
    e.pour(0, 1);
    e.restart();
    expect(e.snapshot()).toEqual(board([[0, 1, 1], [1], [0, 0, 0]]));
    expect(e.moves).toBe(0);
    expect(e.historyLength).toBe(0);
  });

  it('does not mutate the initial definition', () => {
    const def = board([[0, 1, 1], [1], [0, 0, 0]]);
    const e = new PuzzleEngine(def);
    e.pour(0, 1);
    expect(def.tubes[0]).toEqual([0, 1, 1]);
  });

  it('replays saved history and rejects corrupt history', () => {
    const e = new PuzzleEngine(board([[0, 1, 1], [1], [0, 0, 0]]));
    expect(e.replay([[0, 1]])).toBe(true);
    expect(e.tubes[1]).toEqual([1, 1, 1]);
    expect(e.replay([[0, 1], [1, 0]])).toBe(false);
    expect(e.moves).toBe(0);
  });
});

describe('dead ends and structure', () => {
  it('detects when no useful move remains', () => {
    expect(hasUsefulMove(board([[0, 1], [1, 0]], 2))).toBe(false);
    expect(hasUsefulMove(board([[0, 1], [1, 0], []], 2))).toBe(true);
  });

  it('validates colour counts', () => {
    expect(validateStructure(board([[0, 0, 1, 1], [1, 1, 0, 0], []]), 2)).toEqual([]);
    expect(validateStructure(board([[0, 0, 1], [1, 1, 0, 0], []]), 2).length).toBeGreaterThan(0);
  });
});
