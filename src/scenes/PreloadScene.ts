import Phaser from 'phaser';
import { layoutOf } from '../config/layout';
import { COLORS } from '../config/theme';
import { GameManager } from '../systems/GameManager';
import { createStaticTextures } from '../ui/TextureFactory';

async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const loads = ['500', '600', '700'].map((w) => document.fonts.load(`${w} 32px "Fredoka"`));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
}

/**
 * Preload: await the cloud save (Playables: loadData MUST complete before any
 * saveData), load the bundled font, and draw all procedural textures.
 */
export class PreloadScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Graphics;
  private progress = 0;

  constructor() {
    super('Preload');
  }

  create(): void {
    const L = layoutOf(this);
    this.bar = this.add.graphics();
    this.drawBar(L, 0.1);
    void this.run(L);
  }

  private drawBar(L: ReturnType<typeof layoutOf>, p: number): void {
    this.progress = Math.max(this.progress, p);
    const w = Math.min(L.w * 0.5, 220 * L.u);
    const h = 8 * L.u;
    this.bar.clear();
    this.bar.fillStyle(0x2a2f66, 1);
    this.bar.fillRoundedRect(L.cx - w / 2, L.cy - h / 2, w, h, h / 2);
    this.bar.fillStyle(COLORS.pink, 1);
    this.bar.fillRoundedRect(L.cx - w / 2, L.cy - h / 2, Math.max(h, w * this.progress), h, h / 2);
  }

  private async run(L: ReturnType<typeof layoutOf>): Promise<void> {
    await Promise.all([
      GameManager.init().then(() => this.drawBar(L, 0.55)),
      loadFonts().then(() => this.drawBar(L, 0.45)),
    ]);
    createStaticTextures(this);
    this.drawBar(L, 1);
    this.time.delayedCall(60, () => this.scene.start('Splash'));
  }
}
