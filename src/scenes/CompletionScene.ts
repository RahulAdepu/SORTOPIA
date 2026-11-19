import Phaser from 'phaser';
import { layoutOf } from '../config/layout';
import { COLORS, CSS } from '../config/theme';
import { classicConfig, MODES } from '../modes/GameModes';
import { getAchievement } from '../systems/Achievements';
import { GameManager } from '../systems/GameManager';
import type { LevelResult } from '../types/game';
import { Button, dimmer, fitText, IconButton, modalPanel, text, toast } from '../ui/components';
import { leaveGameTo } from '../ui/overlay';
import { panelTexture } from '../ui/TextureFactory';

/** Victory overlay: stars, score, rewards and what's next. */
export class CompletionScene extends Phaser.Scene {
  constructor() {
    super('Completion');
  }

  create(data: { result: LevelResult }): void {
    (this as unknown as { __leaving?: boolean }).__leaving = false;
    const r = data.result;
    const L = layoutOf(this);
    const save = GameManager.save;
    const reduce = save.settings.reducedMotion;
    const cfg = r.config;
    dimmer(this, 0.62);

    const title =
      cfg.mode === 'classic'
        ? `Level ${cfg.level} Complete!`
        : cfg.mode === 'daily'
          ? 'Daily Complete!'
          : cfg.mode === 'zen'
            ? 'All Sorted!'
            : `Stage ${cfg.stage} Cleared!`;
    const pw = Math.min(L.col, 360 * L.u);
    // Content stack (design units): stars 84 · badge 46 · score 80 · stats 58 · rewards 52 · buttons 84.
    const ph = Math.min(L.h * 0.9, (r.perfect ? 470 : 440) * L.u);
    const panel = modalPanel(this, pw, ph, title, cfg.mode === 'daily' ? COLORS.orange : COLORS.pink);
    const top = -ph / 2;

    // Stars
    const starY = top + 86 * L.u;
    const starSize = 70 * L.u;
    const stars: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * starSize * 1.08;
      const y = starY + (i === 1 ? -12 * L.u : 0);
      const scale = (starSize * (i === 1 ? 1.15 : 1)) / 160;
      panel.add(this.add.image(x, y, 'star-empty').setScale(scale));
      const s = this.add.image(x, y, 'star-full').setScale(reduce ? scale : 0).setAlpha(reduce ? 1 : 0);
      s.setData('scale', scale);
      if (i < r.stars) stars.push(s);
      else s.setVisible(false);
      panel.add(s);
    }
    const sparkle = this.add.particles(0, 0, 'spark', {
      speed: { min: 80 * L.u, max: 220 * L.u },
      lifespan: 700,
      scale: { start: 0.5 * L.u, end: 0 },
      tint: [COLORS.yellow, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    stars.forEach((s, i) => {
      if (reduce) return;
      this.tweens.add({
        targets: s,
        scale: s.getData('scale') as number,
        alpha: 1,
        delay: 350 + i * 330,
        duration: 420,
        ease: 'Back.easeOut',
        onStart: () => {
          GameManager.audio.play('star', { index: i });
          GameManager.haptic(14);
        },
        onComplete: () => {
          const m = s.getWorldTransformMatrix();
          sparkle.explode(14, m.tx, m.ty);
        },
      });
    });
    sparkle.setDepth(10);

    let y = starY + 54 * L.u;
    if (r.perfect) {
      const badge = this.add.image(0, y, panelTexture(this, 128 * L.u, 26 * L.u, { top: 0x8ef0c4, bottom: 0x2fb487, radius: 13 * L.u, gloss: true }));
      const bt = text(this, 0, y, 'PERFECT!', 13, { weight: 700, shadow: true });
      panel.add([badge, bt]);
      if (!reduce) this.tweens.add({ targets: [badge, bt], scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
      y += 34 * L.u;
    } else {
      y += 4 * L.u;
    }

    // Score with count-up
    panel.add(text(this, 0, y, 'SCORE', 11, { weight: 600, color: CSS.textDim }));
    const scoreText = text(this, 0, y + 25 * L.u, '0', 32, { weight: 700, shadow: true });
    panel.add(scoreText);
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: r.score,
      duration: reduce ? 10 : 900,
      delay: 300,
      ease: 'Cubic.easeOut',
      onUpdate: () => scoreText.setText(Math.round(counter.v).toLocaleString('en-US')),
    });
    const bestLine = cfg.mode === 'classic' ? (r.newBest && !r.firstClear ? 'NEW BEST!' : `Best ${r.bestScore.toLocaleString('en-US')}`) : r.newBest ? 'NEW RECORD!' : '';
    if (bestLine) {
      const bt = text(this, 0, y + 52 * L.u, bestLine, 12, { weight: 700, color: r.newBest && !r.firstClear ? CSS.gold : CSS.textDim });
      panel.add(bt);
    }
    y += 100 * L.u;

    // Stats row
    const stats: [string, string][] = [['MOVES', cfg.moveLimit ? `${r.stats.moves}/${cfg.moveLimit}` : `${r.stats.moves}`]];
    stats.push(['PAR', String(cfg.par)]);
    if (cfg.timeLimit) stats.push(['TIME LEFT', `${Math.floor(r.stats.timeLeft ?? 0)}s`]);
    else stats.push(['TIME', `${Math.floor(r.stats.elapsed / 60)}:${String(Math.floor(r.stats.elapsed % 60)).padStart(2, '0')}`]);
    const sw = (pw - 40 * L.u) / stats.length;
    stats.forEach(([label, value], i) => {
      const x = -pw / 2 + 20 * L.u + sw * (i + 0.5);
      panel.add(this.add.image(x, y, panelTexture(this, sw - 8 * L.u, 50 * L.u, { top: 0x262b5f, bottom: 0x1c2050, radius: 14 * L.u })));
      panel.add(text(this, x, y - 10 * L.u, label, 10.5, { weight: 600, color: CSS.textDim }));
      panel.add(text(this, x, y + 9 * L.u, value, 16, { weight: 700 }));
    });
    y += 58 * L.u;

    // Rewards
    const rewards: string[] = [];
    if (r.coins + r.milestoneCoins > 0) rewards.push(`+${r.coins + r.milestoneCoins}`);
    const rw = pw - 40 * L.u;
    panel.add(this.add.image(0, y, panelTexture(this, rw, 40 * L.u, { top: 0x3a2f6e, bottom: 0x2a2458, radius: 20 * L.u, stroke: COLORS.yellow, strokeAlpha: 0.4 })));
    const coinIcon = this.add.image(-rw / 2 + 26 * L.u, y, 'coin').setScale((24 * L.u) / 96);
    const rewardBits = [`+${r.coins + r.milestoneCoins} coins`];
    if (r.hintsAwarded) rewardBits.push(`+${r.hintsAwarded} hint${r.hintsAwarded > 1 ? 's' : ''}`);
    rewardBits.push(`+${r.xp} XP`);
    const rt = text(this, -rw / 2 + 46 * L.u, y, rewardBits.join('   '), 14, { weight: 700, color: CSS.gold, origin: [0, 0.5] });
    fitText(rt, rw - 60 * L.u);
    panel.add([coinIcon, rt]);
    if (r.coins + r.milestoneCoins > 0 && !reduce) this.flyCoins(panel, coinIcon);
    y += 30 * L.u;

    // Buttons
    const next = MODES[cfg.mode].next(cfg, save);
    const by = ph / 2 - 46 * L.u;
    const side = 46 * L.u;
    const gap = 10 * L.u;
    const bw = pw - 40 * L.u - side * 2 - gap * 2;
    const nextLabel = cfg.mode === 'classic' ? (next ? 'NEXT LEVEL' : 'LEVEL MAP') : cfg.mode === 'daily' ? 'CONTINUE' : cfg.mode === 'zen' ? 'NEXT PUZZLE' : 'NEXT STAGE';
    const go = () => {
      if (cfg.mode === 'daily') leaveGameTo(this, 'DailyChallenge');
      else if (next) leaveGameTo(this, 'Game', { config: next });
      else leaveGameTo(this, 'LevelSelection');
    };
    const nb = new Button(this, -pw / 2 + 20 * L.u + bw / 2, by, bw, 58 * L.u, nextLabel, go, { variant: 'success', icon: 'icon-next', fontSize: 20 });
    const replay = () => {
      if (cfg.mode === 'classic') leaveGameTo(this, 'Game', { config: classicConfig(cfg.level as number) });
      else leaveGameTo(this, 'Game', { config: { ...cfg, resume: undefined, puzzle: { ...cfg.puzzle, tubes: cfg.puzzle.tubes.map((t) => t.slice()) } } });
    };
    const rb = new IconButton(this, pw / 2 - 20 * L.u - side - gap - side / 2, by - 3 * L.u, side, 'icon-restart', replay);
    const hb = new IconButton(this, pw / 2 - 20 * L.u - side / 2, by - 3 * L.u, side, 'icon-home', () => leaveGameTo(this, 'MainMenu'));
    panel.add([nb, rb, hb]);
    nb.setAlpha(0);
    this.tweens.add({ targets: nb, alpha: 1, delay: reduce ? 0 : 900, duration: 300 });

    // Level-up and achievements
    let delay = reduce ? 200 : 1500;
    if (r.playerLevelAfter > r.playerLevelBefore) {
      this.time.delayedCall(delay, () => {
        GameManager.audio.play('levelup');
        toast(this, `Level up! Player level ${r.playerLevelAfter}: +${r.levelUpCoins} coins, +${r.levelUpHints} hint${r.levelUpHints === 1 ? '' : 's'}`, { y: L.h * 0.08, icon: 'icon-star', color: 0x2f6e58 });
      });
      delay += 1400;
    }
    if (r.milestoneCoins) {
      this.time.delayedCall(delay, () => GameManager.audio.play('levelup'));
      this.time.delayedCall(delay, () => toast(this, `Chapter chest! +${r.milestoneCoins} coins, +${r.hintsAwarded} hints`, { y: L.h * 0.08, icon: 'icon-gift', color: 0x6b4a1a }));
      delay += 1400;
    }
    for (const id of r.achievements) {
      const a = getAchievement(id);
      if (!a) continue;
      this.time.delayedCall(delay, () => {
        GameManager.audio.play('coin');
        toast(this, `Achievement: ${a.title}  +${a.reward} coins`, { y: L.h * 0.08, icon: 'icon-trophy', color: 0x5a3f8a });
      });
      delay += 1500;
    }

    this.input.keyboard?.on('keydown-ENTER', go);
    this.input.keyboard?.on('keydown-SPACE', go);
    // Esc closes the dialog back to the menu (never preventDefault'ed).
    this.input.keyboard?.on('keydown-ESC', () => leaveGameTo(this, 'MainMenu'));
  }

  private flyCoins(panel: Phaser.GameObjects.Container, from: Phaser.GameObjects.Image): void {
    const L = layoutOf(this);
    for (let i = 0; i < 8; i++) {
      this.time.delayedCall(1000 + i * 60, () => {
        const m = from.getWorldTransformMatrix();
        const c = this.add.image(m.tx, m.ty, 'coin').setScale((22 * L.u) / 96).setDepth(20);
        this.tweens.add({
          targets: c,
          x: L.cx + L.col / 2 - 30 * L.u + (Math.random() - 0.5) * 20 * L.u,
          y: 20 * L.u,
          scale: (14 * L.u) / 96,
          duration: 600,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            c.destroy();
            if (i % 2 === 0) GameManager.audio.play('coin');
          },
        });
      });
    }
    void panel;
  }
}
