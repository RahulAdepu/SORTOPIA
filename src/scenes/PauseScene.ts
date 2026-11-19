import Phaser from 'phaser';
import { layoutOf } from '../config/layout';
import { COLORS, CSS } from '../config/theme';
import { classicConfig, movesStageConfig, timeStageConfig } from '../modes/GameModes';
import { GameManager } from '../systems/GameManager';
import type { PlayConfig } from '../types/game';
import { Button, dimmer, modalPanel, text } from '../ui/components';
import { leaveGameTo } from '../ui/overlay';

/** In-game pause menu (also shown automatically after a platform pause). */
export class PauseScene extends Phaser.Scene {
  private config!: PlayConfig;

  constructor() {
    super('Pause');
  }

  create(data: { config: PlayConfig }): void {
    (this as unknown as { __leaving?: boolean }).__leaving = false;
    this.config = data.config;
    const L = layoutOf(this);
    dimmer(this, 0.7);
    const pw = Math.min(L.col, 330 * L.u);
    const ph = 384 * L.u;
    const panel = modalPanel(this, pw, ph, 'Paused', COLORS.blue);
    const top = -ph / 2;
    const cfg = this.config;
    panel.add(text(this, 0, top + 56 * L.u, `${cfg.title}  ·  ${cfg.subtitle}`, 14, { weight: 600, color: CSS.textDim, wrap: pw - 40 * L.u }));

    const bw = pw - 56 * L.u;
    const bh = 54 * L.u;
    let y = top + 116 * L.u;
    panel.add(new Button(this, 0, y, bw, bh + 6 * L.u, 'RESUME', () => this.resume(), { variant: 'success', icon: 'icon-play', fontSize: 21 }));
    y += 72 * L.u;
    panel.add(new Button(this, 0, y, bw, bh, 'RESTART', () => this.restart(), { variant: 'secondary', icon: 'icon-restart', fontSize: 17 }));
    y += 64 * L.u;
    panel.add(new Button(this, 0, y, bw, bh, 'SETTINGS', () => this.scene.launch('Settings', { from: 'Pause' }), { variant: 'secondary', icon: 'icon-settings', fontSize: 17 }));
    y += 64 * L.u;
    const toMap = cfg.mode === 'classic';
    panel.add(
      new Button(this, 0, y, bw, bh, toMap ? 'LEVEL MAP' : 'MAIN MENU', () => leaveGameTo(this, toMap ? 'LevelSelection' : 'MainMenu'), {
        variant: 'ghost',
        icon: toMap ? 'icon-map' : 'icon-home',
        fontSize: 17,
      }),
    );
    // Esc closes the dialog (we never preventDefault on Esc).
    this.input.keyboard?.on('keydown-ESC', () => this.resume());
  }

  private resume(): void {
    if (this.scene.isActive('Settings')) return;
    this.scene.stop();
    this.scene.resume('Game');
  }

  private restart(): void {
    const cfg = this.config;
    let next: PlayConfig;
    if (cfg.mode === 'classic') next = classicConfig(cfg.level as number);
    else if (cfg.mode === 'time') next = timeStageConfig(cfg.stage ?? 1);
    else if (cfg.mode === 'moves') next = movesStageConfig(cfg.stage ?? 1);
    else next = { ...cfg, resume: undefined };
    if (cfg.mode === 'classic' && GameManager.save.inProgress?.level === cfg.level) {
      GameManager.save.inProgress = null;
      GameManager.commit();
    }
    leaveGameTo(this, 'Game', { config: next });
  }
}
