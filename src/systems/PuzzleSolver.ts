import type { PuzzleState, Tube } from '../types/puzzle';
import { checkMove, cloneState, isSolved } from './PuzzleEngine';

export interface SolveOptions {
  /** Abort after expanding this many states. */
  maxNodes?: number;
  /** Heuristic weight (1 = A*, higher = greedier and faster). */
  weight?: number;
}

export interface SolveResult {
  /** True when a solution was found. */
  solvable: boolean;
  /** True when the search space was exhausted (proves unsolvable). */
  exhausted: boolean;
  /** Solution as [from, to] pairs in the original tube indexing. */
  solution: [number, number][];
  /** States expanded, used as a difficulty signal. */
  expanded: number;
}

/*
 * Internally each container is a short string (one char per unit, 'A' + colour),
 * which makes copying, hashing and comparing states cheap. Container indices
 * are preserved, so solutions map straight back to the player's board.
 */
type Board = string[];

const encodeTube = (t: readonly number[]): string => String.fromCharCode(...t.map((c) => 65 + c));

/** Canonical key: container order is irrelevant to solvability. */
export function canonicalKey(tubes: readonly Tube[]): string {
  return boardKey(tubes.map(encodeTube));
}

function boardKey(board: Board): string {
  return board.slice().sort().join('|');
}

function uniform(s: string): boolean {
  for (let i = 1; i < s.length; i++) if (s.charCodeAt(i) !== s.charCodeAt(0)) return false;
  return true;
}

function complete(s: string, capacity: number): boolean {
  return s.length === capacity && uniform(s);
}

function solvedBoard(board: Board, capacity: number): boolean {
  for (const s of board) if (s.length !== 0 && !complete(s, capacity)) return false;
  return true;
}

function boardHeuristic(board: Board, capacity: number): number {
  // colour boundaries inside containers + (containers each colour is spread over − 1)
  let h = 0;
  const spread = new Uint8Array(32);
  for (const s of board) {
    if (s.length === 0 || complete(s, capacity)) continue;
    let mask = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i) - 65;
      if (i > 0 && s.charCodeAt(i) !== s.charCodeAt(i - 1)) h++;
      if (!(mask & (1 << c))) {
        mask |= 1 << c;
        spread[c]++;
      }
    }
  }
  for (let c = 0; c < spread.length; c++) if (spread[c] > 1) h += spread[c] - 1;
  return h;
}

/** Heuristic: colour boundaries inside containers + how scattered each colour is. */
export function heuristic(tubes: readonly Tube[], capacity: number): number {
  return boardHeuristic(tubes.map(encodeTube), capacity);
}

class MinHeap {
  private items: number[] = [];
  constructor(private readonly score: Float64Array | number[]) {}
  get size(): number {
    return this.items.length;
  }
  push(v: number): void {
    const a = this.items;
    const sc = this.score;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (sc[a[p]] <= sc[a[i]]) break;
      const tmp = a[p];
      a[p] = a[i];
      a[i] = tmp;
      i = p;
    }
  }
  pop(): number | undefined {
    const a = this.items;
    const sc = this.score;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop() as number;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && sc[a[l]] < sc[a[m]]) m = l;
        if (r < a.length && sc[a[r]] < sc[a[m]]) m = r;
        if (m === i) break;
        const tmp = a[m];
        a[m] = a[i];
        a[i] = tmp;
        i = m;
      }
    }
    return top;
  }
}

/**
 * Weighted A* search. Returns a verified solution when one is found within
 * the node budget. When `exhausted` is true the puzzle is proven unsolvable.
 *
 * Pruning that never removes a solution:
 *  - completed containers are never poured from (the rules forbid it);
 *  - only the first empty container is tried as a destination (they're interchangeable);
 *  - a single-colour stack is never poured into an empty container (no-op).
 */
export function solve(state: PuzzleState, options: SolveOptions = {}): SolveResult {
  const maxNodes = options.maxNodes ?? 150_000;
  const weight = options.weight ?? 2;
  const capacity = state.capacity;
  const start: Board = state.tubes.map(encodeTube);
  if (solvedBoard(start, capacity)) return { solvable: true, exhausted: false, solution: [], expanded: 0 };

  const boards: Board[] = [start];
  const g: number[] = [0];
  const f: number[] = [weight * boardHeuristic(start, capacity)];
  const parent: number[] = [-1];
  const moveFrom: number[] = [-1];
  const moveTo: number[] = [-1];
  const heap = new MinHeap(f);
  const bestG = new Map<string, number>([[boardKey(start), 0]]);
  heap.push(0);
  const n = start.length;
  const locks = state.locks && state.locks.some((l) => l > 0) ? state.locks : null;

  let expanded = 0;
  while (heap.size) {
    const idx = heap.pop() as number;
    if (++expanded > maxNodes) return { solvable: false, exhausted: false, solution: [], expanded };
    const board = boards[idx];
    const gNext = g[idx] + 1;
    // Frozen status is a function of how many containers are complete.
    let done = 0;
    if (locks) for (const t of board) if (complete(t, capacity)) done++;
    const frozen = (i: number) => locks !== null && (locks[i] ?? 0) > done;
    let firstEmpty = -1;
    for (let i = 0; i < n; i++) {
      if (board[i].length === 0 && !frozen(i)) {
        firstEmpty = i;
        break;
      }
    }
    for (let a = 0; a < n; a++) {
      const src = board[a];
      if (!src.length || complete(src, capacity) || frozen(a)) continue;
      const top = src.charCodeAt(src.length - 1);
      let run = 1;
      while (run < src.length && src.charCodeAt(src.length - 1 - run) === top) run++;
      const srcUniform = run === src.length;
      for (let b = 0; b < n; b++) {
        if (b === a || frozen(b)) continue;
        const dst = board[b];
        if (dst.length === 0) {
          if (b !== firstEmpty || srcUniform) continue;
        } else if (dst.length >= capacity || dst.charCodeAt(dst.length - 1) !== top) {
          continue;
        }
        const k = Math.min(run, capacity - dst.length);
        const next = board.slice();
        next[a] = src.slice(0, src.length - k);
        next[b] = dst + src.slice(src.length - k);
        const key = boardKey(next);
        const prev = bestG.get(key);
        if (prev !== undefined && prev <= gNext) continue;
        bestG.set(key, gNext);
        const ci = boards.length;
        boards.push(next);
        g.push(gNext);
        f.push(gNext + weight * boardHeuristic(next, capacity));
        parent.push(idx);
        moveFrom.push(a);
        moveTo.push(b);
        if (solvedBoard(next, capacity)) {
          const path: [number, number][] = [];
          for (let i = ci; parent[i] >= 0; i = parent[i]) path.push([moveFrom[i], moveTo[i]]);
          return { solvable: true, exhausted: false, solution: path.reverse(), expanded };
        }
        heap.push(ci);
      }
    }
  }
  return { solvable: false, exhausted: true, solution: [], expanded };
}

/** Replays a solution on a copy of the state and confirms it ends solved. */
export function verifySolution(state: PuzzleState, solution: readonly [number, number][]): boolean {
  const s: PuzzleState = cloneState(state);
  for (const [from, to] of solution) {
    const check = checkMove(s, from, to);
    if (!check.ok) return false;
    const src = s.tubes[from];
    const dst = s.tubes[to];
    for (let i = 0; i < check.count; i++) dst.push(src.pop() as number);
  }
  return isSolved(s);
}

/**
 * Find the shortest solution we can within a budget by trying progressively
 * less greedy weights. Used offline for par values.
 */
export function solveBest(state: PuzzleState, budget = 400_000): SolveResult {
  let best = solve(state, { maxNodes: budget, weight: 3 });
  if (!best.solvable) best = solve(state, { maxNodes: budget * 2, weight: 5 });
  if (!best.solvable) return best;
  for (const weight of [1.5, 1.2]) {
    const r = solve(state, { maxNodes: budget, weight });
    if (r.solvable && r.solution.length < best.solution.length) best = { ...r, expanded: Math.max(r.expanded, best.expanded) };
  }
  return best;
}

