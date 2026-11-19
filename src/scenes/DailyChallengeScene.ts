import Phaser from 'phaser';
import { layoutOf } from '../config/layout';
import { COLORS, CSS, shade } from '../config/theme';
import { dailyConfig } from '../modes/GameModes';
import { GameManager } from '../systems/GameManager';
import { currentDailyStreak, isDailyDone } from '../systems/ProgressManager';
import { dailyCoins } from '../systems/RewardManager';
import { createBackground } from '../ui/Background';
import { Button, fadeIn, goTo, IconButton, text } from '../ui/components';
import { panelTexture } from '../ui/TextureFactory';
import { addDays, utcDateKey } from '../utils/random';

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Daily Challenge hub: today's puzzle, streak, week strip, reward, countdown. */
export class DailyChallengeScene extends Phaser.Scene {
  private countdown!: Phaser.GameObjects.Text;
  private today = '';

  constructor() {
    super('DailyChallenge');
  }

  create(): void {
    fadeIn(this);
    const L = layoutOf(this);
    // Centre the ~640-unit content block on tall screens.
    const oy = Math.max(0, (L.h - 680 * L.u) * 0.5);
    const save = GameManager.save;
    this.today = utcDateKey();
    const done = isDailyDone(save, this.today);
    const streak = currentDailyStreak(save, this.today);
    GameManager.audio.playMusic('menu');
    createBackground(this, COLORS.yellow, { theme: 'peaks' });

    new IconButton(this, L.cx - L.col / 2 + 24 * L.u, 40 * L.u, 46 * L.u, 'icon-back', () => goTo(this, 'MainMenu'));
    text(this, L.cx, 40 * L.u, 'Daily Challenge', 22, { weight: 700, shadow: true });

    // Date card
    const d = new Date(`${this.today}T00:00:00Z`);
    const cw = Math.min(L.col, 340 * L.u);
    const cardY = (150 * L.u + oy);
    this.add.image(L.cx, cardY, panelTexture(this, cw, 130 * L.u, { top: 0xffe08f, bottom: 0xf5a930, radius: 26 * L.u, lip: 8 * L.u, lipColor: 0xb8701a, shadow: true, gloss: true }));
    text(this, L.cx, cardY - 34 * L.u, DAY_NAMES[d.getUTCDay()], 14, { weight: 700, color: '#7A4500' });
    text(this, L.cx, cardY + 2 * L.u, String(d.getUTCDate()), 46, { weight: 700, color: '#5A3300' });
    text(this, L.cx, cardY + 40 * L.u, `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, 13, { weight: 600, color: '#7A4500' });

    // Streak
    const sy = (258 * L.u + oy);
    const flame = this.add.image(L.cx - 58 * L.u, sy, 'icon-flame').setScale((44 * L.u) / 128).setTint(streak > 0 ? COLORS.orange : 0x555b99);
    if (streak > 0 && !save.settings.reducedMotion) this.tweens.add({ targets: flame, scale: flame.scale * 1.12, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    text(this, L.cx - 28 * L.u, sy - 9 * L.u, `${streak}-day streak`, 20, { weight: 700, origin: [0, 0.5] });
    text(this, L.cx - 28 * L.u, sy + 13 * L.u, `Best: ${save.daily.bestStreak} days`, 12, { weight: 500, color: CSS.textDim, origin: [0, 0.5] });

    // Week strip (last 7 UTC days)
    const wy = (330 * L.u + oy);
    const slot = Math.min(44 * L.u, (L.col - 12 * L.u) / 7);
    for (let i = 6; i >= 0; i--) {
      const key = addDays(this.today, -i);
      const dd = new Date(`${key}T00:00:00Z`);
      const x = L.cx + (3 - i) * (slot + 4 * L.u);
      const completed = save.daily.history.includes(key);
      const isToday = i === 0;
      this.add.image(x, wy, panelTexture(this, slot, slot * 1.25, {
        top: completed ? 0x8ef0c4 : isToday ? 0x4a5199 : 0x262b5f,
        bottom: completed ? 0x2fb487 : isToday ? 0x353b7c : 0x1c2050,
        radius: 12 * L.u,
        stroke: isToday ? COLORS.yellow : undefined,
        strokeAlpha: 0.9,
      }));
      text(this, x, wy - slot * 0.32, DAY_NAMES[dd.getUTCDay()].slice(0, 2), 10.5, { weight: 700, color: completed ? '#0E3B2C' : CSS.textDim });
      if (completed) this.add.image(x, wy + slot * 0.12, 'icon-check').setScale((slot * 0.45) / 128).setTint(0x0e3b2c);
      else text(this, x, wy + slot * 0.12, String(dd.getUTCDate()), 13, { weight: 700, color: CSS.text });
    }

    // Reward preview
    const ry = (412 * L.u + oy);
    const nextStreak = done ? streak : streak + 1;
    this.add.image(L.cx, ry, panelTexture(this, cw, 64 * L.u, { top: 0x3a2f6e, bottom: 0x2a2458, radius: 20 * L.u, stroke: COLORS.yellow, strokeAlpha: 0.45 }));
    this.add.image(L.cx - cw / 2 + 34 * L.u, ry, 'icon-gift').setScale((34 * L.u) / 128).setTint(COLORS.yellow);
    text(this, L.cx - cw / 2 + 62 * L.u, ry - 10 * L.u, done ? 'Reward collected!' : "Today's reward", 12, { weight: 600, color: CSS.textDim, origin: [0, 0.5] });
    text(this, L.cx - cw / 2 + 62 * L.u, ry + 11 * L.u, `${dailyCoins(nextStreak)} coins  +  1 hint`, 16, { weight: 700, color: CSS.gold, origin: [0, 0.5] });
    const cfg = dailyConfig(this.today);
    text(this, L.cx, ry + 54 * L.u, `Today: ${cfg.colors} colours · ${cfg.puzzle.tubes.length} bottles · same puzzle for every player`, 11, { weight: 500, color: CSS.textMuted, wrap: L.col });

    // Play / status
    const by = (530 * L.u + oy);
    const bw = Math.min(L.col, 300 * L.u);
    if (done) {
      text(this, L.cx, by - 34 * L.u, 'Done for today. Nice work!', 15, { weight: 700, color: CSS.green });
      new Button(this, L.cx, by + 14 * L.u, bw, 52 * L.u, 'PLAY AGAIN', () => goTo(this, 'Game', { config: dailyConfig(this.today) }), { variant: 'secondary', icon: 'icon-restart', fontSize: 18, sub: 'Just for fun, no reward' });
    } else {
      const b = new Button(this, L.cx, by, bw, 68 * L.u, 'PLAY TODAY', () => goTo(this, 'Game', { config: dailyConfig(this.today) }), { variant: 'warning', icon: 'icon-play', fontSize: 24 });
      if (!save.settings.reducedMotion) this.tweens.add({ targets: b, scale: 1.04, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.countdown = text(this, L.cx, by + 76 * L.u, '', 13, { weight: 600, color: CSS.textDim });
    this.add.image(L.cx, by + 76 * L.u, panelTexture(this, 230 * L.u, 30 * L.u, { top: shade(COLORS.panel, 0.05), bottom: COLORS.panel, radius: 15 * L.u })).setDepth(-1);
    this.updateCountdown();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.updateCountdown() });
    this.input.keyboard?.on('keydown-ESC', () => goTo(this, 'MainMenu'));
  }

  private updateCountdown(): void {
    const now = Date.now();
    const next = Date.parse(`${addDays(utcDateKey(new Date(now)), 1)}T00:00:00Z`);
    const s = Math.max(0, Math.floor((next - now) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    this.countdown.setText(`Next puzzle in ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
    if (utcDateKey() !== this.today) this.scene.restart();
  }
}
