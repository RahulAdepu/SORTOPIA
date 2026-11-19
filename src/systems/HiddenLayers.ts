import type { Tube } from '../types/puzzle';

/**
 * "?" mystery layers: at the start every unit except each container's top is
 * concealed. A concealed unit can never move until it reaches the top (only
 * the top run moves, and the top is always visible), so it is revealed the
 * moment its position becomes the top of its container, or when it leaves.
 * Reveals are permanent (undo never re-hides), matching player expectation.
 *
 * Solvability is unaffected: hidden layers only limit what the player sees.
 */
export class HiddenLayers {
  private hidden: boolean[][];

  constructor(initial: readonly Tube[], enabled: boolean) {
    this.hidden = initial.map((t) => t.map((_, k) => enabled && k < t.length - 1));
  }

  get enabled(): boolean {
    return this.hidden.some((t) => t.some(Boolean));
  }

  isHidden(tube: number, position: number): boolean {
    return this.hidden[tube]?.[position] ?? false;
  }

  /** Mask for one container, bottom → top (true = concealed). */
  mask(tube: number, length: number): boolean[] {
    return Array.from({ length }, (_, k) => this.isHidden(tube, k));
  }

  /**
   * Update after the board changed. Returns positions revealed by this change
   * as [tube, position] pairs (for reveal animations).
   */
  sync(tubes: readonly (readonly number[])[]): [number, number][] {
    const revealed: [number, number][] = [];
    tubes.forEach((t, i) => {
      const row = this.hidden[i] ?? (this.hidden[i] = []);
      // Anything at or above the current top has been exposed or moved away.
      for (let k = Math.max(0, t.length - 1); k < row.length; k++) {
        if (row[k]) {
          if (k < t.length) revealed.push([i, k]);
          row[k] = false;
        }
      }
    });
    return revealed;
  }

  /** Count of still-hidden units (for HUD / tests). */
  get remaining(): number {
    return this.hidden.reduce((a, t) => a + t.filter(Boolean).length, 0);
  }
}
