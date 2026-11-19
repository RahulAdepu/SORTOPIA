/** A liquid colour, identified by its index into the liquid palette. */
export type ColorId = number;

/** A container's contents, ordered bottom → top. Each entry is one liquid unit. */
export type Tube = ColorId[];

/** A complete puzzle board. */
export interface PuzzleState {
  /** Ordered stacks, bottom → top. */
  tubes: Tube[];
  /** Maximum units each container can hold. */
  capacity: number;
  /**
   * Frozen containers: locks[i] = number of completed containers required
   * before container i can be used (0 / missing = usable). Frozen containers
   * start empty. Frozen status is derived live from the completed count, so it
   * is a pure function of the board (the solver relies on this).
   */
  locks?: number[];
}

/** A single pour from one container into another. */
export interface Move {
  from: number;
  to: number;
  /** How many units were transferred. */
  count: number;
  /** The colour that was poured. */
  color: ColorId;
}

export type MoveRejection =
  | 'same-container'
  | 'out-of-range'
  | 'source-empty'
  | 'source-complete'
  | 'destination-full'
  | 'container-frozen'
  | 'color-mismatch';

export type MoveCheck = { ok: true; count: number; color: ColorId } | { ok: false; reason: MoveRejection };

/** A level definition as shipped in the level dataset. */
export interface LevelDefinition {
  /** 1-based level number. */
  id: number;
  colors: number;
  capacity: number;
  /** Starting tubes (bottom → top), including empties. */
  tubes: Tube[];
  /** Length of a verified solution. Used for star thresholds. */
  par: number;
  /** Optional move limit. Always ≥ par so the level is provably winnable. */
  moveLimit?: number;
  /** Seed used to generate the level (0 for curated). */
  seed: number;
  /** A verified solution, stored as [from, to] pairs. */
  solution: [number, number][];
  /** Frozen containers (see PuzzleState.locks). */
  locks?: number[];
  /** Hidden layers: every unit except each container's top starts concealed. */
  hidden?: boolean;
  /** An intentionally gentler level after a run of hard ones. */
  breather?: boolean;
}
