import Phaser from 'phaser';
import { GameManager } from '../systems/GameManager';

/**
 * From an overlay on top of the Game scene: fade both out, stop the overlay
 * stack and start `key`. Used by Completion / GameOver / Pause.
 */
export function leaveGameTo(overlay: Phaser.Scene, key: string, data?: object): void {
  const flag = overlay as unknown as { __leaving?: boolean };
  if (flag.__leaving) return;
  flag.__leaving = true;
  overlay.input.enabled = false;
  const ms = GameManager.save.settings.reducedMotion ? 80 : 220;
  const game = overlay.scene.get('Game');
  overlay.cameras.main.fadeOut(ms, 23, 27, 54);
  if (game?.sys.isVisible()) game.cameras.main.fadeOut(ms, 23, 27, 54);
  overlay.time.delayedCall(ms + 10, () => {
    const mgr = overlay.game.scene;
    for (const k of ['Pause', 'Settings', 'Completion', 'GameOver']) if (k !== overlay.scene.key && mgr.isActive(k)) mgr.stop(k);
    if (key !== 'Game') mgr.stop('Game');
    mgr.stop(overlay.scene.key);
    if (key === 'Game' && (mgr.isActive('Game') || mgr.isPaused('Game'))) mgr.stop('Game');
    mgr.start(key, data);
  });
}
