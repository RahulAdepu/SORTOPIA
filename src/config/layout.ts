import type Phaser from 'phaser';
import { GameManager } from '../systems/GameManager';

/** Maximum device pixel ratio we render at (crisp on phones, bounded fill-rate). */
export const MAX_DPR = 2.5;

export function deviceRatio(): number {
  return Math.min(MAX_DPR, Math.max(1, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
}

/** Design units: layouts are authored for a ~400×760 portrait reference. */
export interface Layout {
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** Device pixels per design unit. */
  u: number;
  /** Width of the centred content column. */
  col: number;
  portrait: boolean;
  /** Font multiplier from the "large text" accessibility option. */
  textScale: number;
}

export function layoutOf(scene: Phaser.Scene): Layout {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const u = Math.max(0.5, Math.min(w / 400, h / 760));
  return {
    w,
    h,
    cx: w / 2,
    cy: h / 2,
    u,
    col: Math.min(w - 24 * u, 460 * u),
    portrait: h >= w,
    textScale: GameManager.save.settings.largeText ? 1.15 : 1,
  };
}
