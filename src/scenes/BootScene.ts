import Phaser from 'phaser';
import { GameManager } from '../systems/GameManager';

/**
 * Boot: draw the first frame immediately and tell the platform about it,
 * then hand off to Preload which awaits cloud save + fonts.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const game = this.game;
    // Detach Phaser's focus/visibility handling: pausing is driven only by the
    // Playables SDK onPause/onResume (see main.ts installVisibilityGuard).
    game.events.off(Phaser.Core.Events.HIDDEN);
    game.events.off(Phaser.Core.Events.VISIBLE);
    game.events.off(Phaser.Core.Events.BLUR);
    game.events.off(Phaser.Core.Events.FOCUS);
    window.onblur = null;
    window.onfocus = null;

    this.cameras.main.setBackgroundColor('#171B36');
    game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      GameManager.platform.firstFrameReady();
      const boot = document.getElementById('boot');
      if (boot) {
        boot.style.opacity = '0';
        setTimeout(() => boot.remove(), 400);
      }
    });
    this.scene.start('Preload');
  }
}
