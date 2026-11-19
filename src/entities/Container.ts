import Phaser from 'phaser';
import { CSS, FONT, LIQUIDS, MYSTERY } from '../config/theme';
import { GameManager } from '../systems/GameManager';
import { bottleTextures, iceTexture, type BottleTextures } from '../ui/TextureFactory';
import { drawSymbol } from '../ui/Symbols';
import { bandPolygon, clipHalfPlane, levelForArea, upVector, type BottleGeometry, type Pt } from './Liquid';

/** Visual liquid layer (amount may be fractional while animating). */
export interface Segment {
  color: number;
  amount: number;
  /** A concealed "?" unit (always amount 1, never merged). */
  hidden?: boolean;
}

export interface ContainerOptions {
  /** Per-unit concealment mask, bottom → top. */
  hiddenMask?: readonly boolean[];
  /** Frozen: shows ice until thawed; label says what thaws it. */
  frozenLabel?: string;
  /** Bottle style id (defaults to the equipped one). */
  style?: string;
}

/**
 * A glass container on the board. Purely presentational: it mirrors the
 * engine's state through `segments`, which animations interpolate. Game
 * rules never read from here.
 */
export class LiquidContainer extends Phaser.GameObjects.Container {
  readonly index: number;
  readonly capacity: number;
  readonly geo: BottleGeometry;
  readonly tex: BottleTextures;
  home: { x: number; y: number };
  segments: Segment[] = [];
  selected = false;
  complete = false;
  /** True while this container's position is owned by a pour animation. */
  away = false;
  /** Serialises animations that involve this container. */
  queue: Promise<void> = Promise.resolve();
  pendingAnimations = 0;
  sloshAngle = 0;

  private back: Phaser.GameObjects.Image;
  private front: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private cork: Phaser.GameObjects.Image;
  private liquid: Phaser.GameObjects.Graphics;
  private symbols: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Image;
  private dirty = true;
  private sloshTween: Phaser.Tweens.Tween | null = null;
  private glowTween: Phaser.Tweens.Tween | null = null;
  private lastDrawRotation = NaN;
  private marks: Phaser.GameObjects.Text[] = [];
  private ice: Phaser.GameObjects.Container | null = null;
  frozen = false;

  constructor(
    scene: Phaser.Scene,
    index: number,
    x: number,
    y: number,
    W: number,
    H: number,
    capacity: number,
    contents: readonly number[],
    opts: ContainerOptions = {},
  ) {
    super(scene, x, y);
    this.index = index;
    this.capacity = capacity;
    this.home = { x, y };
    this.tex = bottleTextures(scene, W, H, opts.style ?? GameManager.save.cosmetics.bottle);
    this.geo = this.tex.geo;

    this.shadow = scene.add.image(x, y + H / 2 + W * 0.04, 'glow').setTint(0x02030c).setAlpha(0.55).setDisplaySize(W * 1.5, W * 0.38).setDepth(1);
    this.glow = scene.add.image(0, 0, this.tex.glow).setAlpha(0).setTint(0xffe27a);
    this.back = scene.add.image(0, 0, this.tex.back);
    this.liquid = scene.add.graphics();
    this.symbols = scene.add.graphics();
    this.front = scene.add.image(0, 0, this.tex.front);
    this.cork = scene.add.image(0, -H / 2 - this.geo.lipH * 0.25, this.tex.cork).setVisible(false);
    this.add([this.glow, this.back, this.liquid, this.symbols, this.front, this.cork]);
    this.setDepth(10);
    this.setSegmentsFromTube(contents, opts.hiddenMask);
    this.complete = this.isFullUniform();
    if (this.complete) this.showCork(false);
    if (opts.frozenLabel) this.freeze(opts.frozenLabel);
    scene.add.existing(this);
  }

  // ------------------------------------------------------------ frozen

  private freeze(label: string): void {
    this.frozen = true;
    const geo = this.geo;
    const c = this.scene.add.container(0, 0);
    const ice = this.scene.add.image(0, 0, iceTexture(this.scene, geo.W, geo.H));
    const flake = this.scene.add.image(0, -geo.H * 0.08, 'icon-snow').setScale((geo.W * 0.55) / 128).setAlpha(0.9);
    const t = this.scene.add
      .text(0, geo.H * 0.2, label, {
        fontFamily: FONT.family,
        fontSize: `${Math.max(9, Math.round(geo.W * 0.2))}px`,
        fontStyle: '700',
        color: '#1E4E7A',
        align: 'center',
        wordWrap: { width: geo.innerW * 1.05, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    c.add([ice, flake, t]);
    this.add(c);
    this.ice = c;
    if (!GameManager.save.settings.reducedMotion) {
      this.scene.tweens.add({ targets: flake, angle: 360, duration: 9000, repeat: -1 });
    }
  }

  /** Thaw with a crack-and-melt animation. */
  thaw(animate: boolean): void {
    if (!this.frozen) return;
    this.frozen = false;
    const ice = this.ice;
    this.ice = null;
    if (!ice) return;
    if (!animate || GameManager.save.settings.reducedMotion) {
      ice.destroy();
      return;
    }
    this.scene.tweens.add({ targets: ice, scaleX: 1.12, scaleY: 1.06, alpha: 0, duration: 520, ease: 'Quad.easeIn', onComplete: () => ice.destroy() });
  }

  /** Re-freeze (only happens when undo takes back the completion that thawed it). */
  refreeze(label: string): void {
    if (this.frozen) return;
    this.freeze(label);
  }

  get unitArea(): number {
    return this.geo.fullArea / this.capacity;
  }

  get totalUnits(): number {
    return this.segments.reduce((a, s) => a + s.amount, 0);
  }

  setSegmentsFromTube(tube: readonly number[], hiddenMask?: readonly boolean[]): void {
    this.segments = [];
    tube.forEach((c, k) => {
      const hidden = !!hiddenMask?.[k];
      const top = this.segments[this.segments.length - 1];
      if (!hidden && top && !top.hidden && top.color === c) top.amount += 1;
      else this.segments.push(hidden ? { color: c, amount: 1, hidden: true } : { color: c, amount: 1 });
    });
    this.dirty = true;
  }

  /** Snap visual amounts to whole units (after an animation). Hidden units never merge. */
  normalize(): void {
    for (const s of this.segments) s.amount = Math.round(s.amount);
    this.segments = this.segments.filter((s) => s.amount > 0);
    const merged: Segment[] = [];
    for (const s of this.segments) {
      const top = merged[merged.length - 1];
      if (top && !top.hidden && !s.hidden && top.color === s.color) top.amount += s.amount;
      else merged.push({ ...s });
    }
    this.segments = merged;
    this.dirty = true;
  }

  /** True when the top unit is still a "?" (needs revealing after liquid left). */
  get topHidden(): boolean {
    return !!this.segments[this.segments.length - 1]?.hidden;
  }

  /** Reveal the top "?" unit with a flash. Returns the revealed colour or null. */
  revealTop(): number | null {
    const top = this.segments[this.segments.length - 1];
    if (!top?.hidden) return null;
    top.hidden = false;
    this.normalize();
    if (!GameManager.save.settings.reducedMotion) {
      const flash = this.scene.add.image(0, this.surfaceLocalY() + this.geo.W * 0.3, 'glow').setTint((LIQUIDS[top.color] ?? LIQUIDS[0]).light).setAlpha(0.95);
      flash.setDisplaySize(this.geo.W * 1.6, this.geo.W * 1.2).setBlendMode(Phaser.BlendModes.ADD);
      this.add(flash);
      this.scene.tweens.add({ targets: flash, alpha: 0, scaleX: flash.scaleX * 1.6, duration: 600, onComplete: () => flash.destroy() });
    }
    return top.color;
  }

  isFullUniform(): boolean {
    return this.segments.length === 1 && Math.round(this.segments[0].amount) === this.capacity;
  }

  /** Add (or with negative `amount`, remove) liquid at the top. */
  changeTop(color: number, amount: number): void {
    const top = this.segments[this.segments.length - 1];
    if (amount >= 0) {
      if (top && top.color === color) top.amount += amount;
      else this.segments.push({ color, amount });
    } else if (top) {
      top.amount += amount;
      if (top.amount <= 0.0001) this.segments.pop();
    }
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Called every frame by the scene. Redraws only when something changed. */
  tick(): void {
    if (this.rotation !== this.lastDrawRotation || this.sloshAngle !== 0) this.dirty = true;
    if (!this.away) this.shadow.setAlpha(this.selected ? 0.3 : 0.55);
    if (this.dirty) this.redraw();
  }

  private redraw(): void {
    this.dirty = false;
    this.lastDrawRotation = this.rotation;
    const g = this.liquid;
    g.clear();
    this.symbols.clear();
    if (!this.segments.length) {
      this.marks.forEach((m) => m.setVisible(false));
      return;
    }
    const geo = this.geo;
    const up = upVector(this.rotation + this.sloshAngle);
    const unit = this.unitArea;
    let lowLevel = -Infinity;
    let cum = 0;
    const levels: number[] = [];
    for (const s of this.segments) {
      cum += s.amount * unit;
      levels.push(levelForArea(geo.interior, up, cum));
    }
    for (let i = 0; i < this.segments.length; i++) {
      const col = this.segments[i].hidden ? MYSTERY : (LIQUIDS[this.segments[i].color] ?? LIQUIDS[0]);
      const hi = levels[i];
      const poly = bandPolygon(geo.interior, up, lowLevel === -Infinity ? -1e6 : lowLevel, hi);
      if (poly.length >= 3) {
        g.fillStyle(col.base, 1);
        g.fillPoints(poly as Phaser.Types.Math.Vector2Like[], true);
        // Refraction stripe: a soft lighter column (in the glass's frame) that
        // reads as light passing through a rounded volume of liquid.
        const iw = geo.innerW;
        const stripe = clipHalfPlane(clipHalfPlane(poly, { x: -1, y: 0 }, -(iw * 0.12)), { x: 1, y: 0 }, iw * 0.3);
        if (stripe.length >= 3) {
          g.fillStyle(col.light, 0.28);
          g.fillPoints(stripe as Phaser.Types.Math.Vector2Like[], true);
        }
        // Lit upper edge of every lower layer (the top layer gets the meniscus below).
        if (i < this.segments.length - 1) {
          const lip = bandPolygon(geo.interior, up, hi - Math.max(1, geo.W * 0.035), hi);
          if (lip.length >= 3) {
            g.fillStyle(col.light, 0.4);
            g.fillPoints(lip as Phaser.Types.Math.Vector2Like[], true);
          }
        }
        // darker lower edge for depth separation between layers
        const sep = Math.max(1, geo.W * 0.03);
        if (lowLevel !== -Infinity) {
          const p2 = bandPolygon(geo.interior, up, lowLevel, lowLevel + sep);
          if (p2.length >= 3) {
            g.fillStyle(col.dark, 0.55);
            g.fillPoints(p2 as Phaser.Types.Math.Vector2Like[], true);
          }
        }
      }
      lowLevel = hi;
    }
    // Liquid surface highlight (meniscus) on the topmost layer.
    const top = this.segments[this.segments.length - 1];
    const topLevel = levels[levels.length - 1];
    const thick = Math.max(1.5, geo.W * 0.07);
    const surf = bandPolygon(geo.interior, up, topLevel - thick, topLevel);
    if (surf.length >= 3) {
      const col = top.hidden ? MYSTERY : (LIQUIDS[top.color] ?? LIQUIDS[0]);
      g.fillStyle(col.light, 0.95);
      g.fillPoints(surf as Phaser.Types.Math.Vector2Like[], true);
    }

    // "?" marks on concealed units and colour-vision symbols on the rest, only
    // when (nearly) upright so they stay legible.
    const upright = Math.abs(this.rotation) < 0.05 && Math.abs(this.sloshAngle) < 0.08;
    const showSymbols = GameManager.save.settings.colorSymbols;
    let acc = 0;
    let markIdx = 0;
    const size = geo.innerW * 0.36;
    for (const s of this.segments) {
      const whole = Math.floor(s.amount + 0.001);
      for (let k = 0; k < whole && upright; k++) {
        const mid = -levelForArea(geo.interior, up, (acc + k + 0.5) * unit);
        if (s.hidden) this.mark(markIdx++, mid);
        else if (showSymbols) drawSymbol(this.symbols, s.color, 0, mid, size);
      }
      acc += s.amount;
    }
    for (let i = markIdx; i < this.marks.length; i++) this.marks[i].setVisible(false);
  }

  private mark(i: number, y: number): void {
    let m = this.marks[i];
    if (!m) {
      m = this.scene.add
        .text(0, 0, '?', { fontFamily: FONT.family, fontSize: `${Math.max(10, Math.round(this.geo.innerW * 0.62))}px`, fontStyle: '700', color: CSS.text })
        .setOrigin(0.5)
        .setAlpha(0.85);
      this.marks[i] = m;
      // Above the liquid, below the glass front.
      this.addAt(m, this.getIndex(this.front));
    }
    m.setVisible(true).setY(y);
  }

  /** Mouth (pour spout) in local coordinates for a pour direction. */
  mouthLocal(dir: 1 | -1): Pt {
    const geo = this.geo;
    return { x: dir * (geo.innerW / 2 + geo.wall * 0.6), y: -geo.H / 2 + geo.lipH * 0.3 };
  }

  /** Local Y of the liquid surface when upright (bottom of interior when empty). */
  surfaceLocalY(): number {
    const level = levelForArea(this.geo.interior, upVector(0), this.totalUnits * this.unitArea);
    return -level;
  }

  /** Lift/lower for selection. */
  setSelected(on: boolean, animate = true): void {
    this.selected = on;
    if (this.away) return;
    const reduce = GameManager.save.settings.reducedMotion;
    const y = on ? this.home.y - this.geo.H * 0.13 : this.home.y;
    this.scene.tweens.killTweensOf(this);
    if (animate && !reduce) this.scene.tweens.add({ targets: this, y, duration: on ? 170 : 200, ease: on ? 'Back.easeOut' : 'Quad.easeOut' });
    else this.y = y;
    this.glowTween?.stop();
    this.glow.setTint(0xffffff);
    if (on) {
      // Steady outline: selection is a state, not an alert.
      this.glow.setTint(0xfff3c4).setAlpha(0.95);
      this.slosh(0.12);
    } else {
      this.glow.setAlpha(0);
    }
  }

  /** Highlight used by hints (gold pulsing glow, independent of selection). */
  setHintGlow(on: boolean): void {
    this.glowTween?.stop();
    if (on) {
      this.glow.setTint(0xffd166).setAlpha(0.4);
      this.glowTween = this.scene.tweens.add({ targets: this.glow, alpha: 1, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (!this.selected) {
      this.glow.setAlpha(0).setTint(0xffffff);
    }
  }

  /** Damped liquid slosh: the surface tilts back and forth relative to the glass. */
  slosh(amplitude: number, duration = 900): void {
    if (GameManager.save.settings.reducedMotion) return;
    this.sloshTween?.stop();
    const state = { t: 0 };
    this.sloshTween = this.scene.tweens.add({
      targets: state,
      t: 1,
      duration,
      onUpdate: () => {
        const decay = Math.pow(1 - state.t, 2);
        this.sloshAngle = Math.sin(state.t * Math.PI * 5) * amplitude * decay;
      },
      onComplete: () => {
        this.sloshAngle = 0;
        this.dirty = true;
      },
    });
  }

  /** Invalid-move feedback. */
  shake(): void {
    if (this.away) return;
    const x = this.home.x;
    this.scene.tweens.killTweensOf(this);
    this.y = this.selected ? this.home.y - this.geo.H * 0.13 : this.home.y;
    this.scene.tweens.add({
      targets: this,
      x: { from: x - this.geo.W * 0.12, to: x },
      duration: 300,
      ease: 'Elastic.easeOut',
      easeParams: [1.2, 0.25],
      onComplete: () => (this.x = x),
    });
    this.slosh(0.18, 600);
  }

  showCork(animate: boolean): void {
    const targetY = -this.geo.H / 2 - this.geo.lipH * 0.25;
    this.cork.setVisible(true);
    if (animate && !GameManager.save.settings.reducedMotion) {
      this.cork.setY(targetY - this.geo.H * 0.35).setAlpha(0);
      this.scene.tweens.add({ targets: this.cork, y: targetY, alpha: 1, duration: 380, ease: 'Bounce.easeOut' });
    } else {
      this.cork.setY(targetY).setAlpha(1);
    }
  }

  hideCork(): void {
    this.cork.setVisible(false);
  }

  setComplete(on: boolean, animate: boolean): void {
    if (on === this.complete) return;
    this.complete = on;
    if (on) {
      this.showCork(animate);
      if (animate) {
        const tint = (LIQUIDS[this.segments[0]?.color ?? 0] ?? LIQUIDS[0]).light;
        this.glow.setTint(tint).setAlpha(1);
        this.scene.tweens.add({ targets: this.glow, alpha: 0, duration: 900, ease: 'Quad.easeOut' });
      }
    } else {
      this.hideCork();
    }
  }

  /** Keep the ground shadow at home while the bottle travels. */
  updateShadow(): void {
    const lifted = this.home.y - this.y;
    this.shadow.setAlpha(Phaser.Math.Clamp(0.55 - lifted / (this.geo.H * 0.8), 0.15, 0.55));
  }

  destroy(fromScene?: boolean): void {
    this.shadow.destroy();
    this.sloshTween?.stop();
    this.glowTween?.stop();
    super.destroy(fromScene);
  }
}
