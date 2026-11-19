import Phaser from 'phaser';
import { layoutOf, type Layout } from '../config/layout';
import { COLORS, CSS, shade } from '../config/theme';
import { LiquidContainer } from '../entities/Container';
import { isModeUnlocked, MODES, movesStageConfig, type GameMode } from '../modes/GameModes';
import { totalStars } from '../systems/Achievements';
import { GameManager } from '../systems/GameManager';
import { currentDailyStreak, isDailyDone } from '../systems/ProgressManager';
import { levelProgress, playerLevelFromXp, xpForLevel } from '../systems/RewardManager';
import { createBackground } from '../ui/Background';
import { Button, fadeIn, fitText, goTo, IconButton, Pill, text, toast } from '../ui/components';
import { logoTexture, panelTexture, shelfTexture } from '../ui/TextureFactory';
import { modeArtTexture, type ModeArtKind } from '../ui/ModeArt';
import type { ModeId } from '../types/game';

export class MainMenuScene extends Phaser.Scene {
  private bottles: LiquidContainer[] = [];
  private coinPill!: Pill;
  private starPill!: Pill;
  private unsub: (() => void) | null = null;
  /** Vertical offset that centres the 760-unit layout on tall screens. */
  private oy = 0;

  constructor() {
    super('MainMenu');
  }

  create(): void {
    fadeIn(this);
    const L = layoutOf(this);
    this.oy = Math.max(0, (L.h - 760 * L.u) * 0.5);
    const save = GameManager.save;
    GameManager.audio.playMusic('menu');
    createBackground(this, COLORS.purple);

    this.buildTopBar(L);

    // Logo
    const logoH = Math.min(L.w * 0.13, 56 * L.u);
    const logo = this.add.image(L.cx, (118 * L.u + this.oy), logoTexture(this, logoH));
    if (logo.width > L.col) logo.setScale(L.col / logo.width);
    const tag = text(this, L.cx, (118 * L.u + this.oy) + logoH * 0.72, 'THE ULTIMATE COLOR SORT CHALLENGE', 11, { weight: 600, color: CSS.textDim });
    tag.setLetterSpacing(0.6 * L.u);
    fitText(tag, L.col);
    if (!save.settings.reducedMotion) this.tweens.add({ targets: logo, y: logo.y - 5 * L.u, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.buildShowcase(L);

    // Primary actions
    const fresh = save.unlocked === 1 && !save.inProgress && !Object.keys(save.levels).length;
    const next = Math.min(save.unlocked, 100);
    const resume = save.inProgress ? save.inProgress.level : null;
    const bw = Math.min(L.col, 330 * L.u);
    const continueLabel = fresh ? 'PLAY' : 'CONTINUE';
    const continueSub = resume ? `Resume Level ${resume}` : `Level ${next}`;
    const primary = new Button(this, L.cx, (384 * L.u + this.oy), bw, 72 * L.u, continueLabel, () => this.continueGame(), {
      variant: 'primary',
      icon: 'icon-play',
      fontSize: 28,
      sub: continueSub,
    });
    if (!save.settings.reducedMotion) this.tweens.add({ targets: primary, scale: 1.035, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    new Button(this, L.cx, (460 * L.u + this.oy), bw, 52 * L.u, fresh ? 'LEVELS' : 'PLAY', () => goTo(this, 'LevelSelection'), {
      variant: 'secondary',
      icon: 'icon-map',
      fontSize: 19,
    });

    this.buildModes(L);

    // Bottom row
    const by = Math.min(L.h - 46 * L.u, 712 * L.u + this.oy);
    const s = 52 * L.u;
    const step = 70 * L.u;
    new IconButton(this, L.cx - step * 1.5, by, s, 'icon-trophy', () => goTo(this, 'Achievements'), { caption: 'Awards', tint: COLORS.yellow });
    new IconButton(this, L.cx - step * 0.5, by, s, 'icon-calendar', () => this.openMode('daily'), { caption: 'Daily' });
    new IconButton(this, L.cx + step * 0.5, by, s, 'icon-shop', () => goTo(this, 'Shop'), { caption: 'Shop', variant: 'warning' });
    new IconButton(this, L.cx + step * 1.5, by, s, 'icon-settings', () => this.scene.launch('Settings', { from: 'MainMenu' }), { caption: 'Settings' });

    this.unsub = GameManager.onChange(() => this.refresh());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsub?.();
      this.bottles = [];
    });

    // Playables: the game is interactable now → gameReady (idempotent).
    this.time.delayedCall(50, () => GameManager.platform.gameReady());
  }

  private buildTopBar(L: Layout): void {
    const save = GameManager.save;
    const y = 36 * L.u;
    const left = L.cx - L.col / 2;
    const right = L.cx + L.col / 2;
    // Player level badge
    const lvl = playerLevelFromXp(save.xp);
    const r = 22 * L.u;
    const g = this.add.graphics();
    g.fillStyle(0x1b1f48, 1).fillCircle(left + r, y, r);
    g.lineStyle(4 * L.u, 0x3a4190, 1).strokeCircle(left + r, y, r - 2 * L.u);
    g.lineStyle(4 * L.u, COLORS.green, 1);
    g.beginPath();
    g.arc(left + r, y, r - 2 * L.u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, levelProgress(save.xp)));
    g.strokePath();
    text(this, left + r, y, String(lvl), 17, { weight: 700 });
    const into = save.xp - xpForLevel(lvl);
    const need = xpForLevel(lvl + 1) - xpForLevel(lvl);
    text(this, left + r * 2 + 8 * L.u, y - 8 * L.u, `Level ${lvl}`, 15, { weight: 700, origin: [0, 0.5] });
    text(this, left + r * 2 + 8 * L.u, y + 10 * L.u, `${into} / ${need} XP`, 11, { weight: 500, color: CSS.textDim, origin: [0, 0.5] });

    const pw = 92 * L.u;
    const ph = 34 * L.u;
    this.coinPill = new Pill(this, right - pw / 2, y, pw, ph, 'coin', String(save.coins));
    this.starPill = new Pill(this, right - pw * 1.5 - 8 * L.u, y, pw, ph, 'star-full', String(totalStars(save)));
  }

  private buildShowcase(L: Layout): void {
    const reduce = GameManager.save.settings.reducedMotion;
    const W = 34 * L.u;
    const H = W * 3.3;
    const y = (262 * L.u + this.oy);
    const sets = [
      [0, 0, 1, 1],
      [2, 2, 2, 2],
      [1, 1, 3, 0],
      [4, 4, 4],
      [5, 3, 3, 3],
    ];
    const gap = Math.min(64 * L.u, (L.col - W) / (sets.length - 1));
    const shelfH = Math.max(8, W * 0.24);
    this.add.image(L.cx, y + H / 2 + shelfH * 0.42, shelfTexture(this, gap * (sets.length - 1) + W * 2.2, shelfH, 0x7a5a8c)).setDepth(2);
    sets.forEach((contents, i) => {
      const x = L.cx + (i - (sets.length - 1) / 2) * gap;
      const b = new LiquidContainer(this, i, x, y, W, H, 4, contents);
      this.bottles.push(b);
      if (!reduce) {
        this.tweens.add({ targets: b, y: y - 7 * L.u, duration: 1300 + i * 170, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 120 });
        this.time.addEvent({ delay: 2600 + i * 700, loop: true, callback: () => b.slosh(0.1, 1100) });
      }
    });
  }

  private buildModes(L: Layout): void {
    const save = GameManager.save;
    const ids: ModeId[] = ['daily', 'time', 'moves', 'zen'];
    const cw = (Math.min(L.col, 380 * L.u) - 10 * L.u) / 2;
    const ch = 62 * L.u;
    const top = (530 * L.u + this.oy);
    ids.forEach((id, i) => {
      const mode = MODES[id];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = L.cx + (col === 0 ? -1 : 1) * (cw / 2 + 5 * L.u);
      const y = top + row * (ch + 10 * L.u);
      this.modeCard(L, mode, x, y, cw, ch, isModeUnlocked(mode, save));
    });
  }

  /** Mode tile: solid accent colour, a small illustration carrying real data, and the player's status. */
  private modeCard(L: Layout, mode: GameMode, x: number, y: number, w: number, h: number, unlocked: boolean): void {
    const save = GameManager.save;
    const c = this.add.container(x, y);
    const top = unlocked ? shade(mode.accent, 0.12) : 0x3b4078;
    const bottom = unlocked ? shade(mode.accent, -0.12) : 0x2e3266;
    const lip = Math.round(h * 0.08);
    c.add(this.add.image(0, 0, panelTexture(this, w, h, { top, bottom, radius: 16 * L.u, lip, lipColor: shade(bottom, -0.4), shadow: true, gloss: true })));
    const dark = mode.id === 'daily' && unlocked;
    const ink = dark ? '#3D2400' : CSS.text;
    const art = h * 0.9;
    const artX = -w / 2 + art * 0.5 + 4 * L.u;
    const contentY = -lip / 2;
    if (unlocked) {
      const label = mode.id === 'daily' ? String(new Date().getUTCDate()) : mode.id === 'moves' ? String(movesStageConfig(save.stats.movesBestStage + 1).moveLimit ?? '') : '';
      c.add(this.add.image(artX, contentY, modeArtTexture(this, mode.id as ModeArtKind, art, label)));
    } else {
      c.add(this.add.image(artX, contentY, 'icon-lock').setScale((art * 0.42) / 128).setAlpha(0.55));
    }
    const tx = artX + art * 0.5 + 2 * L.u;
    const maxW = w / 2 - tx - 8 * L.u;
    const name = text(this, tx, contentY - h * 0.15, mode.name, 14, { weight: 700, color: unlocked ? ink : CSS.textDim, origin: [0, 0.5] });
    fitText(name, maxW);
    let status: string;
    if (!unlocked) status = `Unlocks at level ${mode.unlockAfterLevel}`;
    else if (mode.id === 'daily') status = isDailyDone(save) ? 'Done for today' : currentDailyStreak(save) > 0 ? `${currentDailyStreak(save)}-day streak` : 'Play today';
    else if (mode.id === 'time') status = save.stats.timeBestStage ? `Best: stage ${save.stats.timeBestStage}` : 'Not played yet';
    else if (mode.id === 'moves') status = save.stats.movesBestStage ? `Best: stage ${save.stats.movesBestStage}` : 'Not played yet';
    else status = save.stats.zenSolved ? `${save.stats.zenSolved} solved` : 'No timer, no limit';
    const sub = text(this, tx, contentY + h * 0.17, status, 11.5, { weight: 600, color: unlocked ? ink : CSS.textMuted, origin: [0, 0.5] });
    sub.setAlpha(unlocked ? 0.85 : 1);
    fitText(sub, maxW);
    c.add([name, sub]);
    if (mode.id === 'daily' && unlocked && !isDailyDone(save)) {
      // A static "NEW" sticker, slightly askew, instead of a pulsing dot.
      const sticker = this.add.container(w / 2 - 14 * L.u, -h / 2 + 4 * L.u).setAngle(8);
      sticker.add(this.add.image(0, 0, panelTexture(this, 40 * L.u, 20 * L.u, { top: 0xff5d73, bottom: 0xe0485f, radius: 7 * L.u, lip: 2, shadow: true })));
      sticker.add(text(this, 0, -1 * L.u, 'NEW', 10, { weight: 700 }));
      c.add(sticker);
    }
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.95, duration: 70 }));
    c.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 150 }));
    c.on('pointerup', () => {
      this.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
      GameManager.audio.play('click');
      if (!unlocked) {
        GameManager.audio.play('invalid');
        toast(this, `Finish level ${mode.unlockAfterLevel} to unlock ${mode.name}`, { icon: 'icon-lock' });
        return;
      }
      this.openMode(mode.id);
    });
  }

  private openMode(id: ModeId): void {
    const save = GameManager.save;
    const mode = MODES[id];
    if (!isModeUnlocked(mode, save)) {
      GameManager.audio.play('invalid');
      toast(this, `Finish level ${mode.unlockAfterLevel} to unlock ${mode.name}`, { icon: 'icon-lock' });
      return;
    }
    if (id === 'daily') {
      goTo(this, 'DailyChallenge');
      return;
    }
    goTo(this, 'Game', { config: mode.start(save) });
  }

  private continueGame(): void {
    const save = GameManager.save;
    const level = save.inProgress?.level ?? Math.min(save.unlocked, 100);
    goTo(this, 'Game', { config: MODES.classic.start(save, level) });
  }

  private refresh(): void {
    const save = GameManager.save;
    this.coinPill?.setValue(String(save.coins));
    this.starPill?.setValue(String(totalStars(save)));
  }

  update(): void {
    for (const b of this.bottles) b.tick();
  }
}
