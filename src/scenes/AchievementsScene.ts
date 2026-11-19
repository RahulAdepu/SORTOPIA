import Phaser from 'phaser';
import { layoutOf } from '../config/layout';
import { COLORS, CSS } from '../config/theme';
import { ACHIEVEMENTS, type AchievementCategory } from '../systems/Achievements';
import { GameManager } from '../systems/GameManager';
import { createBackground } from '../ui/Background';
import { fadeIn, fitText, goTo, IconButton, text } from '../ui/components';
import { panelTexture } from '../ui/TextureFactory';

const CATEGORY: Record<AchievementCategory, { label: string; icon: string; color: number }> = {
  progress: { label: 'Progress', icon: 'icon-map', color: COLORS.blue },
  mastery: { label: 'Mastery', icon: 'icon-star', color: COLORS.yellow },
  daily: { label: 'Daily', icon: 'icon-flame', color: COLORS.orange },
  challenge: { label: 'Challenge', icon: 'icon-timer', color: COLORS.pink },
};

/** Scrollable list of achievements with progress bars and rewards. */
export class AchievementsScene extends Phaser.Scene {
  private contentHeight = 0;
  private dragging = false;
  private lastY = 0;
  private velocity = 0;

  constructor() {
    super('Achievements');
  }

  create(): void {
    fadeIn(this);
    const L = layoutOf(this);
    const save = GameManager.save;
    const bg = createBackground(this, COLORS.yellow, { bubbles: 8 });
    bg.list.forEach((o) => (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0));

    const unlocked = ACHIEVEMENTS.filter((a) => save.achievements[a.id]).length;
    let y = 104 * L.u;
    const cw = Math.min(L.col, 420 * L.u);
    const ch = 74 * L.u;
    const order: AchievementCategory[] = ['progress', 'mastery', 'daily', 'challenge'];
    for (const cat of order) {
      const meta = CATEGORY[cat];
      text(this, L.cx - cw / 2 + 4 * L.u, y, meta.label.toUpperCase(), 12, { weight: 700, color: CSS.textDim, origin: [0, 0.5] }).setLetterSpacing(1.5 * L.u);
      y += 24 * L.u;
      for (const a of ACHIEVEMENTS.filter((x) => x.category === cat)) {
        const done = !!save.achievements[a.id];
        const prog = Math.min(a.target, a.progress(save));
        const cy = y + ch / 2;
        this.add.image(L.cx, cy, panelTexture(this, cw, ch, { top: done ? 0x34407e : 0x272c62, bottom: done ? 0x262f68 : 0x1d2150, radius: 18 * L.u, stroke: done ? meta.color : 0x3a4080, strokeAlpha: done ? 0.75 : 0.5, shadow: true }));
        const ix = L.cx - cw / 2 + 38 * L.u;
        this.add.image(ix, cy, panelTexture(this, 50 * L.u, 50 * L.u, { top: done ? meta.color : 0x353b7c, bottom: done ? 0x2a2f62 : 0x22265a, radius: 16 * L.u, gloss: done }));
        this.add.image(ix, cy, done ? meta.icon : 'icon-lock').setScale((26 * L.u) / 128).setAlpha(done ? 1 : 0.55);
        const tx = ix + 36 * L.u;
        const title = text(this, tx, cy - 18 * L.u, a.title, 15, { weight: 700, origin: [0, 0.5] });
        fitText(title, cw * 0.5);
        const desc = text(this, tx, cy + 2 * L.u, a.description, 11, { weight: 500, color: CSS.textDim, origin: [0, 0.5] });
        fitText(desc, cw - (tx - (L.cx - cw / 2)) - 70 * L.u);
        // progress bar
        const bw = cw - (tx - (L.cx - cw / 2)) - 82 * L.u;
        const g = this.add.graphics();
        g.fillStyle(0x15183b, 1).fillRoundedRect(tx, cy + 17 * L.u, bw, 8 * L.u, 4 * L.u);
        g.fillStyle(done ? COLORS.green : meta.color, 1).fillRoundedRect(tx, cy + 17 * L.u, Math.max(8 * L.u, (bw * prog) / a.target), 8 * L.u, 4 * L.u);
        text(this, tx + bw + 6 * L.u, cy + 21 * L.u, `${prog}/${a.target}`, 11, { weight: 600, color: CSS.textDim, origin: [0, 0.5] });
        // reward
        const rx = L.cx + cw / 2 - 34 * L.u;
        this.add.image(rx, cy - 12 * L.u, done ? 'icon-check' : 'coin').setScale(done ? (22 * L.u) / 128 : (22 * L.u) / 96).setTint(done ? COLORS.green : 0xffffff);
        text(this, rx, cy + 10 * L.u, done ? 'Earned' : `+${a.reward}`, 11, { weight: 700, color: done ? CSS.green : CSS.gold });
        y += ch + 10 * L.u;
      }
      y += 12 * L.u;
    }
    this.contentHeight = y + 20 * L.u;

    // Fixed header
    const header = this.add.image(L.cx, 40 * L.u, panelTexture(this, L.w, 84 * L.u, { top: 0x1b1f48, bottom: 0x171b3d, radius: 1, alpha: 0.94 })).setScrollFactor(0).setDepth(100);
    header.setDisplaySize(L.w + 4, 84 * L.u);
    new IconButton(this, L.cx - L.col / 2 + 24 * L.u, 40 * L.u, 46 * L.u, 'icon-back', () => goTo(this, 'MainMenu')).setScrollFactor(0).setDepth(101);
    text(this, L.cx, 32 * L.u, 'Achievements', 22, { weight: 700, shadow: true }).setScrollFactor(0).setDepth(101);
    text(this, L.cx, 56 * L.u, `${unlocked} of ${ACHIEVEMENTS.length} unlocked`, 11, { weight: 600, color: CSS.gold }).setScrollFactor(0).setDepth(101);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, L.w, Math.max(L.h, this.contentHeight));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.velocity = 0;
      this.lastY = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return;
      const dy = p.y - this.lastY;
      cam.scrollY -= dy;
      this.velocity = -dy;
      this.lastY = p.y;
    });
    this.input.on('pointerup', () => (this.dragging = false));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => (cam.scrollY += dy));
    this.input.keyboard?.on('keydown-ESC', () => goTo(this, 'MainMenu'));
  }

  update(): void {
    const cam = this.cameras.main;
    if (!this.dragging && Math.abs(this.velocity) > 0.1) {
      cam.scrollY += this.velocity;
      this.velocity *= 0.92;
    }
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, Math.max(0, this.contentHeight - cam.height));
  }
}
