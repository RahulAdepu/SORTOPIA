import type { ColorId, Move, MoveCheck, PuzzleState, Tube } from '../types/puzzle';

/*
 * Pure puzzle rules. No Phaser imports: everything here is unit-testable and
 * shared by the game, the solver, the generator and the level build script.
 */

export function cloneTubes(tubes: readonly Tube[]): Tube[] {
  return tubes.map((t) => t.slice());
}

export function cloneState(state: PuzzleState): PuzzleState {
  const out: PuzzleState = { capacity: state.capacity, tubes: cloneTubes(state.tubes) };
  if (state.locks) out.locks = state.locks.slice();
  return out;
}

export function topColor(tube: readonly ColorId[]): ColorId | undefined {
  return tube.length ? tube[tube.length - 1] : undefined;
}

/** Number of contiguous units of the top colour. */
export function topRunLength(tube: readonly ColorId[]): number {
  if (!tube.length) return 0;
  const c = tube[tube.length - 1];
  let n = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === c; i--) n++;
  return n;
}

export function isUniform(tube: readonly ColorId[]): boolean {
  for (let i = 1; i < tube.length; i++) if (tube[i] !== tube[0]) return false;
  return true;
}

/** A container is complete when it is full of a single colour. */
export function isTubeComplete(tube: readonly ColorId[], capacity: number): boolean {
  return tube.length === capacity && isUniform(tube);
}

/** The puzzle is solved when every container is either empty or complete. */
export function isSolved(state: PuzzleState): boolean {
  return state.tubes.every((t) => t.length === 0 || isTubeComplete(t, state.capacity));
}

/** Validate a pour without mutating anything. */
/** Is container `index` frozen on this board? */
export function isFrozen(state: PuzzleState, index: number): boolean {
  const need = state.locks?.[index] ?? 0;
  return need > 0 && countCompleted(state) < need;
}

export function checkMove(state: PuzzleState, from: number, to: number): MoveCheck {
  const { tubes, capacity } = state;
  if (from === to) return { ok: false, reason: 'same-container' };
  if (from < 0 || to < 0 || from >= tubes.length || to >= tubes.length) return { ok: false, reason: 'out-of-range' };
  if (state.locks && (isFrozen(state, from) || isFrozen(state, to))) return { ok: false, reason: 'container-frozen' };
  const src = tubes[from];
  const dst = tubes[to];
  if (src.length === 0) return { ok: false, reason: 'source-empty' };
  if (isTubeComplete(src, capacity)) return { ok: false, reason: 'source-complete' };
  if (dst.length >= capacity) return { ok: false, reason: 'destination-full' };
  const color = src[src.length - 1];
  if (dst.length > 0 && dst[dst.length - 1] !== color) return { ok: false, reason: 'color-mismatch' };
  const count = Math.min(topRunLength(src), capacity - dst.length);
  return { ok: true, count, color };
}

/** Apply a validated pour, mutating `tubes`. Returns the move or null when illegal. */
export function applyMoveInPlace(state: PuzzleState, from: number, to: number): Move | null {
  const check = checkMove(state, from, to);
  if (!check.ok) return null;
  const src = state.tubes[from];
  const dst = state.tubes[to];
  for (let i = 0; i < check.count; i++) dst.push(src.pop() as ColorId);
  return { from, to, count: check.count, color: check.color };
}

/** Reverse a move, mutating `tubes`. */
export function revertMoveInPlace(state: PuzzleState, move: Move): void {
  const src = state.tubes[move.from];
  const dst = state.tubes[move.to];
  for (let i = 0; i < move.count; i++) src.push(dst.pop() as ColorId);
}

/** Every legal pour from the current state (no pruning). */
export function legalMoves(state: PuzzleState): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let f = 0; f < state.tubes.length; f++) {
    for (let t = 0; t < state.tubes.length; t++) {
      if (checkMove(state, f, t).ok) out.push({ from: f, to: t });
    }
  }
  return out;
}

/**
 * True when a legal move exists that actually changes the arrangement in a
 * meaningful way (i.e. excluding pouring a single-colour tube into an empty one).
 */
export function hasUsefulMove(state: PuzzleState): boolean {
  for (const m of legalMoves(state)) {
    const src = state.tubes[m.from];
    const dst = state.tubes[m.to];
    if (dst.length === 0 && isUniform(src)) continue;
    return true;
  }
  return false;
}

export function countCompleted(state: PuzzleState): number {
  return state.tubes.filter((t) => isTubeComplete(t, state.capacity)).length;
}

/** Structural validation for a puzzle definition. Returns a list of problems (empty when valid). */
export function validateStructure(state: PuzzleState, colors: number): string[] {
  const problems: string[] = [];
  if (state.capacity < 2) problems.push('capacity must be ≥ 2');
  const counts = new Map<ColorId, number>();
  for (const t of state.tubes) {
    if (t.length > state.capacity) problems.push('tube exceeds capacity');
    for (const c of t) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  if (counts.size !== colors) problems.push(`expected ${colors} colours, found ${counts.size}`);
  for (const [c, n] of counts) {
    if (n !== state.capacity) problems.push(`colour ${c} has ${n} units (expected ${state.capacity})`);
    if (c < 0 || !Number.isInteger(c)) problems.push(`invalid colour id ${c}`);
  }
  return problems;
}

/**
 * Stateful game session: current board + undo history.
 * The view layer reads from it; animations never own game state.
 */
export class PuzzleEngine {
  readonly initial: PuzzleState;
  private state: PuzzleState;
  private history: Move[] = [];
  private moveCount = 0;

  constructor(initial: PuzzleState) {
    this.initial = cloneState(initial);
    this.state = cloneState(initial);
  }

  get tubes(): readonly (readonly ColorId[])[] {
    return this.state.tubes;
  }

  get capacity(): number {
    return this.state.capacity;
  }

  /** Moves made (undo does not refund moves; see `undo`). */
  get moves(): number {
    return this.moveCount;
  }

  get historyLength(): number {
    return this.history.length;
  }

  get historyMoves(): readonly Move[] {
    return this.history;
  }

  /** History as [from, to] pairs, used for saving an in-progress game. */
  get historyPairs(): [number, number][] {
    return this.history.map((m) => [m.from, m.to]);
  }

  snapshot(): PuzzleState {
    return cloneState(this.state);
  }

  get locks(): readonly number[] | undefined {
    return this.state.locks;
  }

  isFrozen(index: number): boolean {
    return isFrozen(this.state, index);
  }

  /**
   * Extra Bottle power-up: append an empty, usable container. History is kept
   * (indices of existing containers don't change), so undo still works.
   */
  addContainer(): number {
    this.state.tubes.push([]);
    this.initial.tubes.push([]);
    if (this.state.locks) this.state.locks.push(0);
    if (this.initial.locks) this.initial.locks.push(0);
    return this.state.tubes.length - 1;
  }

  canPour(from: number, to: number): MoveCheck {
    return checkMove(this.state, from, to);
  }

  pour(from: number, to: number): Move | null {
    const move = applyMoveInPlace(this.state, from, to);
    if (move) {
      this.history.push(move);
      this.moveCount++;
    }
    return move;
  }

  /**
   * Undo the last pour. The move counter is decremented too, so undo never
   * costs a player a move-limited level by itself.
   */
  undo(): Move | null {
    const move = this.history.pop();
    if (!move) return null;
    revertMoveInPlace(this.state, move);
    this.moveCount = Math.max(0, this.moveCount - 1);
    return move;
  }

  restart(): void {
    this.state = cloneState(this.initial);
    this.history = [];
    this.moveCount = 0;
  }

  /** Replay saved history. Returns false (and restarts) if any move is invalid. */
  replay(pairs: readonly [number, number][]): boolean {
    this.restart();
    for (const [f, t] of pairs) {
      if (!this.pour(f, t)) {
        this.restart();
        return false;
      }
    }
    return true;
  }

  isSolved(): boolean {
    return isSolved(this.state);
  }

  isTubeComplete(index: number): boolean {
    return isTubeComplete(this.state.tubes[index], this.state.capacity);
  }

  completedCount(): number {
    return countCompleted(this.state);
  }

  hasUsefulMove(): boolean {
    return hasUsefulMove(this.state);
  }
}
