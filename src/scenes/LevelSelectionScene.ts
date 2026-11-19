import Phaser from 'phaser';
import { layoutOf, type Layout } from '../config/layout';
import { COLORS, CSS, shade } from '../config/theme';
import { CHAPTERS } from '../data/levels/levelPlan';
import { getLevel } from '../data/levels';
import { classicConfig } from '../modes/GameModes';
import { totalStars } from '../systems/Achievements';
import { GameManager } from '../systems/GameManager';
import { isLevelUnlocked } from '../systems/ProgressManager';
import { createBackground } from '../ui/Background';
import { fadeIn, goTo, IconButton, Pill, text, toast } from '../ui/components';
import { panelTexture } from '../ui/TextureFactory';

const PER_ROW = 5;

/** What each chapter adds, shown on its banner. */
const CHAPTER_FEATURE: Record<number, string> = {
  11: 'Undo & hints',
  26: 'Mystery layers',
  51: 'Tall bottles',
  76: 'Frozen bottles',
};

/**
 * Scrollable level map. Each chapter is a header followed by a winding path
 * of level nodes (snake order). Drag or mouse-wheel to scroll; tap to play.
 */
export class LevelSelectionScene extends Phaser.Scene {
  private contentHeight = 0;
  private topInset = 0;
  private velocity = 0;
  private dragging = false;
  private lastY = 0;
  private lastT = 0;

  constructor() {
    super('LevelSelection');
  }

  create(): void {
    fadeIn(this);
    const L = layoutOf(this);
    const save = GameManager.save;
    GameManager.audio.playMusic('menu');
    const bg = createBackground(this, COLORS.blue, { bubbles: 10 });
    bg.list.forEach((o) => (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0));

    this.topInset = 84 * L.u;
    const current = Math.min(save.unlocked, 100);
    let y = this.topInset + 16 * L.u;
    let currentY = y;
    const path = this.add.graphics();
    const rowGap = 92 * L.u;
    const nodeR = Math.min(26 * L.u, (L.col / PER_ROW) * 0.34);
    const span = Math.min(L.col, 420 * L.u);
    const colX = (i: number) => L.cx - span / 2 + (span / PER_ROW) * (i + 0.5);

    for (const chapter of CHAPTERS) {
      // Chapter header
      const hw = Math.min(L.col, 340 * L.u);
      const hh = 46 * L.u;
      y += hh / 2 + 8 * L.u;
      const unlockedChapter = save.unlocked >= chapter.first;
      this.add.image(L.cx, y, panelTexture(this, hw, hh, { top: shade(chapter.tint, unlockedChapter ? 0.05 : -0.45), bottom: shade(chapter.tint, unlockedChapter ? -0.3 : -0.6), radius: hh / 2, gloss: true, shadow: true }));
      text(this, L.cx, y - 6 * L.u, chapter.name.toUpperCase(), 16, { weight: 700, shadow: true });
      let chStars = 0;
      for (let id = chapter.first; id <= chapter.last; id++) chStars += save.levels[String(id)]?.stars ?? 0;
      const feature = CHAPTER_FEATURE[chapter.first] ? `  ·  ${CHAPTER_FEATURE[chapter.first]}` : '';
      const sub = text(this, L.cx, y + 12 * L.u, `Levels ${chapter.first}–${chapter.last}  ·  ${chStars}/${(chapter.last - chapter.first + 1) * 3} ★${feature}`, 11, { weight: 500, color: '#E6E8FF' });
      if (sub.width > hw - 20 * L.u) sub.setScale((hw - 20 * L.u) / sub.width);
      y += hh / 2 + 40 * L.u;

      const count = chapter.last - chapter.first + 1;
      const rows = Math.ceil(count / PER_ROW);
      const pts: { x: number; y: number }[] = [];
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < PER_ROW; k++) {
          const idx = r * PER_ROW + k;
          if (idx >= count) break;
          const col = r % 2 === 0 ? k : PER_ROW - 1 - k;
          const level = chapter.first + idx;
          const nx = colX(col);
          const ny = y + r * rowGap + Math.sin(idx * 0.9) * 6 * L.u;
          pts.push({ x: nx, y: ny });
          this.levelNode(L, level, nx, ny, nodeR, chapter.tint, level === current);
          if (level === current) currentY = ny;
        }
      }
      // Path behind nodes: dotted curve through consecutive nodes.
      path.lineStyle(6 * L.u, 0xffffff, 0.12);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const done = save.unlocked > chapter.first + i - 1;
        path.lineStyle(6 * L.u, done ? chapter.tint : 0xffffff, done ? 0.55 : 0.12);
        const steps = 10;
        for (let s = 0; s < steps; s += 2) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const turn = Math.abs(a.y - b.y) > rowGap * 0.5;
          const cx = turn ? a.x + (a.x > L.cx ? 1 : -1) * nodeR * 1.8 : (a.x + b.x) / 2;
          const qa = this.quad(a, { x: cx, y: (a.y + b.y) / 2 }, b, t0);
          const qb = this.quad(a, { x: cx, y: (a.y + b.y) / 2 }, b, t1);
          path.lineBetween(qa.x, qa.y, qb.x, qb.y);
        }
      }
      path.setDepth(-1);
      y += rows * rowGap + 4 * L.u;
    }
    this.contentHeight = y + 40 * L.u;

    // Fixed header
    const header = this.add.image(L.cx, 40 * L.u, panelTexture(this, L.w, 84 * L.u, { top: 0x1b1f48, bottom: 0x171b3d, radius: 1, alpha: 0.94 })).setScrollFactor(0).setDepth(100);
    header.setDisplaySize(L.w + 4, 84 * L.u);
    const back = new IconButton(this, L.cx - L.col / 2 + 24 * L.u, 40 * L.u, 46 * L.u, 'icon-back', () => goTo(this, 'MainMenu'));
    back.setScrollFactor(0).setDepth(101);
    text(this, L.cx, 40 * L.u, 'Level Map', 22, { weight: 700, shadow: true }).setScrollFactor(0).setDepth(101);
    const pw = 84 * L.u;
    new Pill(this, L.cx + L.col / 2 - pw / 2, 40 * L.u, pw, 34 * L.u, 'star-full', `${totalStars(save)}`).setScrollFactor(0).setDepth(101);

    // Scrolling
    const cam = this.cameras.main;
    cam.setBounds(0, 0, L.w, Math.max(L.h, this.contentHeight));
    cam.scrollY = Phaser.Math.Clamp(currentY - L.h * 0.5, 0, Math.max(0, this.contentHeight - L.h));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.velocity = 0;
      this.lastY = p.y;
      this.lastT = p.time;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return;
      const dy = p.y - this.lastY;
      const dt = Math.max(1, p.time - this.lastT);
      cam.scrollY -= dy;
      this.velocity = (-dy / dt) * 16;
      this.lastY = p.y;
      this.lastT = p.time;
    });
    this.input.on('pointerup', () => (this.dragging = false));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      cam.scrollY += dy;
    });
    this.input.keyboard?.on('keydown-ESC', () => goTo(this, 'MainMenu'));
  }

  private quad(a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } {
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  }

  private levelNode(L: Layout, level: number, x: number, y: number, r: number, tint: number, isCurrent: boolean): void {
    const save = GameManager.save;
    const rec = save.levels[String(level)];
    const unlocked = isLevelUnlocked(save, level);
    const c = this.add.container(x, y);
    const size = r * 2 * (isCurrent ? 1.18 : 1);
    if (isCurrent) {
      // "You are here" map pin above the current level.
      const pin = this.add.graphics();
      const pr = size * 0.2;
      const py = -size * 0.95;
      pin.fillStyle(0x10132e, 1).fillCircle(0, py, pr + 2.5 * L.u);
      pin.fillTriangle(-pr * 0.75 - 2 * L.u, py + pr * 0.4, pr * 0.75 + 2 * L.u, py + pr * 0.4, 0, py + pr * 2.1 + 2 * L.u);
      pin.fillStyle(COLORS.yellow, 1).fillCircle(0, py, pr);
      pin.fillTriangle(-pr * 0.75, py + pr * 0.4, pr * 0.75, py + pr * 0.4, 0, py + pr * 2.1);
      pin.fillStyle(0x10132e, 1).fillCircle(0, py, pr * 0.4);
      c.add(pin);
      if (!save.settings.reducedMotion) this.tweens.add({ targets: pin, y: -5 * L.u, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const top = !unlocked ? 0x2a2f62 : isCurrent ? 0xffe08f : shade(tint, 0.25);
    const bottom = !unlocked ? 0x1d2148 : isCurrent ? 0xf5a930 : shade(tint, -0.25);
    const body = this.add.image(0, 0, panelTexture(this, size, size, { top, bottom, radius: size / 2, lip: Math.round(size * 0.08), lipColor: shade(bottom, -0.35), gloss: unlocked, shadow: true, stroke: unlocked ? 0xffffff : 0x454c95, strokeAlpha: unlocked ? 0.55 : 0.6 }));
    c.add(body);
    if (unlocked) {
      const num = text(this, 0, -size * 0.04, String(level), (size / L.u) * 0.38, { weight: 700, color: isCurrent ? '#5A3300' : CSS.text, shadow: !isCurrent });
      c.add(num);
      const def = getLevel(level);
      if (def.moveLimit) c.add(this.add.image(size * 0.36, -size * 0.36, 'icon-moves').setScale((size * 0.3) / 128).setTint(COLORS.orange));
      // Mechanic tag (top-left): frozen, tall or mystery layers.
      const mech = def.locks ? ['icon-snow', 0xbfeaff] : def.capacity === 5 ? ['icon-bottle-plus', COLORS.green] : def.hidden ? ['icon-eye', 0xd9c7ff] : null;
      if (mech) c.add(this.add.image(-size * 0.36, -size * 0.36, mech[0] as string).setScale((size * 0.3) / 128).setTint(mech[1] as number));
      if (def.breather && !rec) c.add(this.add.image(0, -size * 0.52, 'icon-leaf').setScale((size * 0.24) / 128).setTint(COLORS.green));
    } else {
      c.add(this.add.image(0, -size * 0.04, 'icon-lock').setScale((size * 0.42) / 128).setAlpha(0.6));
    }
    if (rec) {
      for (let i = 0; i < 3; i++) {
        const s = this.add.image((i - 1) * size * 0.3, size * 0.56 + (i === 1 ? size * 0.05 : 0), i < rec.stars ? 'star-full' : 'star-empty').setScale((size * 0.32) / 160);
        c.add(s);
      }
    }
    c.setSize(size * 1.2, size * 1.2).setInteractive({ useHandCursor: unlocked });
    c.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > 12 * L.u) return; // it was a drag
      if (!unlocked) {
        GameManager.audio.play('invalid');
        toast(this, `Complete level ${level - 1} to unlock`, { icon: 'icon-lock', y: L.h - 80 * L.u });
        this.tweens.add({ targets: c, x: { from: x - 6 * L.u, to: x }, duration: 260, ease: 'Elastic.easeOut' });
        return;
      }
      GameManager.audio.play('select');
      this.tweens.add({ targets: c, scale: 1.15, duration: 120, yoyo: true });
      goTo(this, 'Game', { config: classicConfig(level, save) });
    });
  }

  update(): void {
    const cam = this.cameras.main;
    if (!this.dragging && Math.abs(this.velocity) > 0.1) {
      cam.scrollY += this.velocity;
      this.velocity *= 0.92;
    }
    const max = Math.max(0, this.contentHeight - cam.height);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, max);
  }
}
