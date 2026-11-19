import Phaser from 'phaser';
import { layoutOf } from '../config/layout';
import { COLORS, CSS } from '../config/theme';
import { GameManager } from '../systems/GameManager';
import { createBackground } from '../ui/Background';
import { fadeIn, goTo, text } from '../ui/components';
import { logoTexture } from '../ui/TextureFactory';

/**
 * Splash: colourful liquid waves flood the screen, the SORTOPIA wordmark
 * splashes in, then the liquid drains away into the main menu. Tap to skip.
 */
export class SplashScene extends Phaser.Scene {
  private waves!: Phaser.GameObjects.Graphics;
  private level = 0;
  private t = 0;
  private done = false;

  constructor() {
    super('Splash');
  }

  create(): void {
    fadeIn(this);
    this.done = false;
    this.level = 0;
    this.t = 0;
    const L = layoutOf(this);
    const reduce = GameManager.save.settings.reducedMotion;
    createBackground(this, COLORS.pink, { bubbles: 8 });
    this.waves = this.add.graphics().setDepth(1);

    const logoH = Math.min(L.w * 0.16, 74 * L.u);
    const logo = this.add.image(L.cx, L.cy - 20 * L.u, logoTexture(this, logoH)).setDepth(5);
    const maxW = L.w * 0.9;
    const baseScale = logo.width > maxW ? maxW / logo.width : 1;
    logo.setScale(0).setAlpha(0);
    const tagline = text(this, L.cx, L.cy + logoH * 0.75, 'THE ULTIMATE COLOR SORT CHALLENGE', 14, { weight: 600, color: '#FFFFFF', shadow: true }).setDepth(5).setAlpha(0);
    tagline.setLetterSpacing(2 * L.u);
    if (tagline.width > L.w * 0.9) tagline.setScale((L.w * 0.9) / tagline.width);
    // Sits over the liquid, so white with a soft shadow for contrast.
    const pub = text(this, L.cx, L.h - 40 * L.u, 'MindGrid Labs Pvt. Ltd.', 13, { weight: 600, color: CSS.text, shadow: true }).setDepth(5).setAlpha(0);

    // Liquid rises…
    this.tweens.add({ targets: this, level: 1, duration: reduce ? 200 : 900, ease: 'Cubic.easeOut' });
    // …logo splashes in…
    this.tweens.add({ targets: logo, scale: baseScale, alpha: 1, delay: reduce ? 100 : 550, duration: 650, ease: 'Back.easeOut' });
    this.tweens.add({ targets: tagline, alpha: 1, y: tagline.y + 6 * L.u, delay: reduce ? 150 : 900, duration: 450 });
    this.tweens.add({ targets: pub, alpha: 1, delay: reduce ? 150 : 1000, duration: 450 });
    if (!reduce) this.tweens.add({ targets: logo, y: logo.y - 6 * L.u, delay: 1200, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // …then drains into the menu.
    this.time.delayedCall(reduce ? 900 : 2300, () => this.finish());
    this.input.once('pointerdown', () => this.finish());
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.tweens.add({ targets: this, level: 0, duration: 380, ease: 'Cubic.easeIn' });
    this.time.delayedCall(250, () => goTo(this, 'MainMenu'));
  }

  update(_time: number, delta: number): void {
    this.t += delta / 1000;
    const L = layoutOf(this);
    const g = this.waves;
    g.clear();
    const colors = [COLORS.purple, COLORS.blue, COLORS.pink];
    const heights = [0.36, 0.26, 0.16];
    for (let k = 0; k < colors.length; k++) {
      const baseY = L.h - L.h * heights[k] * this.level;
      const amp = 12 * L.u * (1 - k * 0.2);
      const pts: Phaser.Types.Math.Vector2Like[] = [{ x: 0, y: L.h }];
      const steps = 32;
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * L.w;
        const y = baseY + Math.sin(i * 0.45 + this.t * (1.6 + k * 0.5) + k * 2) * amp + Math.sin(i * 0.17 - this.t * 0.9) * amp * 0.6;
        pts.push({ x, y });
      }
      pts.push({ x: L.w, y: L.h });
      g.fillStyle(colors[k], 0.9);
      g.fillPoints(pts, true);
      // foam highlight line
      g.lineStyle(3 * L.u, 0xffffff, 0.35);
      g.strokePoints(pts.slice(1, -1), false);
    }
  }
}
