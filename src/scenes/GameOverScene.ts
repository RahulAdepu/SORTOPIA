import Phaser from 'phaser';
import { layoutOf } from '../config/layout';
import { COLORS, CSS } from '../config/theme';
import { classicConfig, movesStageConfig, timeStageConfig } from '../modes/GameModes';
import { GameManager } from '../systems/GameManager';
import type { LossReason, PlayConfig, PlayStats } from '../types/game';
import { Button, dimmer, modalPanel, text } from '../ui/components';
import { leaveGameTo } from '../ui/overlay';

/** Shown when the timer runs out or the move limit is reached. */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: { config: PlayConfig; reason: LossReason; stats: PlayStats }): void {
    (this as unknown as { __leaving?: boolean }).__leaving = false;
    const L = layoutOf(this);
    const { config, reason } = data;
    const save = GameManager.save;
    dimmer(this, 0.7);
    const pw = Math.min(L.col, 340 * L.u);
    const ph = 414 * L.u;
    const panel = modalPanel(this, pw, ph, reason === 'time' ? "Time's Up!" : 'Out of Moves!', COLORS.danger);
    const top = -ph / 2;

    const icon = this.add.image(0, top + 82 * L.u, reason === 'time' ? 'icon-timer' : 'icon-moves').setScale((64 * L.u) / 128).setTint(reason === 'time' ? COLORS.blue : COLORS.orange);
    panel.add(icon);
    if (!save.settings.reducedMotion) this.tweens.add({ targets: icon, angle: { from: -8, to: 8 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const explanation =
      reason === 'time'
        ? `The clock ran out before every bottle was sorted. Plan a few pours ahead and keep an empty bottle free for juggling.`
        : `You used all ${config.moveLimit} moves before every bottle was sorted. Try freeing an empty bottle early, and pour whole stacks at once.`;
    panel.add(text(this, 0, top + 160 * L.u, explanation, 14, { weight: 500, color: CSS.textDim, wrap: pw - 56 * L.u, lineSpacing: 4 * L.u }));

    let detail = '';
    if (config.mode === 'time' || config.mode === 'moves') {
      const best = config.mode === 'time' ? save.stats.timeBestStage : save.stats.movesBestStage;
      detail = `Reached stage ${config.stage}   ·   Best cleared: ${best}`;
    } else if (config.mode === 'classic') {
      detail = `Level ${config.level}   ·   ${data.stats.moves} moves made`;
    }
    if (detail) panel.add(text(this, 0, top + 236 * L.u, detail, 13, { weight: 700, color: CSS.gold }));

    const retry = () => {
      let next: PlayConfig;
      if (config.mode === 'classic') next = classicConfig(config.level as number);
      else if (config.mode === 'time') next = timeStageConfig(config.stage ?? 1);
      else if (config.mode === 'moves') next = movesStageConfig(config.stage ?? 1);
      else next = { ...config, resume: undefined };
      leaveGameTo(this, 'Game', { config: next });
    };
    const bw = pw - 48 * L.u;
    panel.add(new Button(this, 0, ph / 2 - 104 * L.u, bw, 56 * L.u, 'TRY AGAIN', retry, { variant: 'primary', icon: 'icon-restart', fontSize: 20 }));
    panel.add(new Button(this, 0, ph / 2 - 42 * L.u, bw, 46 * L.u, 'MAIN MENU', () => leaveGameTo(this, 'MainMenu'), { variant: 'secondary', icon: 'icon-home', fontSize: 16 }));
    this.input.keyboard?.on('keydown-ENTER', retry);
    this.input.keyboard?.on('keydown-ESC', () => leaveGameTo(this, 'MainMenu'));
  }
}
