import type Phaser from 'phaser';
import { GameManager } from '../systems/GameManager';
import { classicConfig } from '../modes/GameModes';

/**
 * Development-only automation hook (tree-shaken from production builds via
 * import.meta.env.DEV). Lets browser-based QA read state and find on-screen
 * targets, then drive the REAL input path by dispatching mouse events.
 */
export function installDebugHook(game: Phaser.Game): void {
  const w = window as unknown as Record<string, unknown>;
  const toCss = (x: number, y: number) => {
    const rect = game.canvas.getBoundingClientRect();
    return { x: rect.left + (x / game.scale.width) * rect.width, y: rect.top + (y / game.scale.height) * rect.height };
  };
  w.__sortopia = {
    scenes: () => game.scene.getScenes(false).filter((s) => s.sys.isActive() || s.sys.isPaused()).map((s) => `${s.scene.key}${s.sys.isPaused() ? '(paused)' : ''}`),
    save: () => JSON.parse(JSON.stringify(GameManager.save)),
    bottles: () => {
      const g = game.scene.getScene('Game') as unknown as { bottles?: { home: { x: number; y: number }; segments: unknown[] }[]; s?: { engine: { tubes: number[][]; moves: number }; finished: boolean } };
      if (!g?.bottles) return null;
      return {
        positions: g.bottles.map((b) => toCss(b.home.x, b.home.y)),
        tubes: g.s?.engine.tubes,
        moves: g.s?.engine.moves,
        finished: g.s?.finished,
        visual: g.bottles.map((b) => b.segments),
      };
    },
    /** CSS-pixel positions of interactive objects (buttons etc.) in active scenes, with labels. */
    targets: () => {
      const out: { scene: string; label: string; x: number; y: number }[] = [];
      for (const s of game.scene.getScenes(true)) {
        for (const o of s.children.list) {
          const go = o as unknown as { input?: { enabled: boolean }; x: number; y: number; list?: unknown[]; label?: { text: string }; icon?: { texture: { key: string } }; getWorldTransformMatrix?: () => { tx: number; ty: number } };
          if (!go.input?.enabled) continue;
          const m = go.getWorldTransformMatrix ? go.getWorldTransformMatrix() : { tx: go.x, ty: go.y };
          const label = go.label?.text ?? go.icon?.texture.key ?? (o as { type: string }).type;
          out.push({ scene: s.scene.key, label, ...toCss(m.tx, m.ty) });
        }
        // nested containers (modal panels)
        const walk = (list: unknown[]) => {
          for (const c of list) {
            const go = c as { input?: { enabled: boolean }; list?: unknown[]; label?: { text: string }; icon?: { texture: { key: string } }; getWorldTransformMatrix: () => { tx: number; ty: number } };
            if (go.list && !go.input) walk(go.list);
            else if (go.input?.enabled && go.list) {
              const m = go.getWorldTransformMatrix();
              out.push({ scene: s.scene.key, label: go.label?.text ?? go.icon?.texture.key ?? 'container', ...toCss(m.tx, m.ty) });
            }
          }
        };
        for (const o of s.children.list) {
          const c = o as { list?: unknown[]; input?: unknown };
          if (c.list && !c.input) walk(c.list);
        }
      }
      return out;
    },
    /** Dispatch a real mouse click at CSS coordinates. */
    click: (x: number, y: number) => {
      const opts = { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 };
      game.canvas.dispatchEvent(new MouseEvent('mousedown', opts));
      setTimeout(() => game.canvas.dispatchEvent(new MouseEvent('mouseup', opts)), 30);
    },
    platform: GameManager.platform,
    gm: GameManager,
    scene: (key: string) => game.scene.getScene(key),
    /** QA helper: jump straight into a Classic level. */
    play: (level: number) => {
      const active = game.scene.getScenes(true)[0];
      active?.scene.start('Game', { config: classicConfig(level, GameManager.save) });
    },
    /** QA helper: shallow-merge fields into the save. */
    patchSave: (patch: Record<string, unknown>) => {
      Object.assign(GameManager.save, patch);
      GameManager.commit(0);
    },
    /** QA helper: unlock every level and mode. */
    unlockAll: () => {
      GameManager.save.unlocked = 100;
      GameManager.save.coins += 500;
      GameManager.commit();
    },
  };
}
