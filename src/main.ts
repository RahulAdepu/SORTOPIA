import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import Phaser from 'phaser';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { deviceRatio } from './config/layout';
import { COLORS } from './config/theme';
import { SCENES } from './scenes';
import { GameManager } from './systems/GameManager';
import { bumpGeneration, purgeOldTextures } from './ui/TextureFactory';

/**
 * Playables rule: "Game MUST NOT use the web Page Visibility API or similar web
 * APIs … MUST only use Playables SDK onPause and onResume." Phaser registers a
 * visibilitychange listener at boot, so we refuse those registrations here and
 * detach Phaser's blur/focus hooks once the game has booted (see BootScene).
 */
function installVisibilityGuard(): void {
  const blocked = new Set(['visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange', 'msvisibilitychange']);
  const original = Document.prototype.addEventListener;
  Document.prototype.addEventListener = function (this: Document, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
    if (blocked.has(type)) return;
    return original.call(this, type, listener, options);
  } as typeof Document.prototype.addEventListener;
}

installVisibilityGuard();

// Initialize Vercel Speed Insights
injectSpeedInsights();

const dpr = deviceRatio();

function viewportSize(): { w: number; h: number } {
  const w = Math.max(1, Math.round(window.innerWidth * dpr));
  const h = Math.max(1, Math.round(window.innerHeight * dpr));
  return { w, h };
}

const initial = viewportSize();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.bg,
  width: initial.w,
  height: initial.h,
  // Render at device resolution, display at CSS size → crisp on every screen.
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
  render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
  audio: { noAudio: true },
  input: { activePointers: 2, keyboard: true },
  disableContextMenu: true,
  autoFocus: false,
  banner: false,
  fps: { target: 60, smoothStep: true },
  scene: SCENES,
});

GameManager.attach(game);

// ---------------------------------------------------------------- resizing
// Playables: must adapt to every aspect ratio and keep state on resize.
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let lastSize = initial;

function applyResize(): void {
  const next = viewportSize();
  if (next.w === lastSize.w && next.h === lastSize.h) return;
  lastSize = next;
  game.scale.resize(next.w, next.h);
  bumpGeneration();
  // Rebuild every visible scene with its current data (scenes keep their own state).
  const scenes = game.scene.getScenes(false).filter((s) => s.sys.isActive() || s.sys.isPaused());
  for (const s of scenes) {
    if (s.scene.key === 'Boot' || s.scene.key === 'Preload') continue;
    s.scene.restart(s.sys.settings.data);
  }
  setTimeout(() => purgeOldTextures(game.textures), 1500);
}

window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyResize, 160);
});

// Block pinch-zoom / double-tap zoom gestures outside the canvas.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// Browsers only allow audio after a user gesture.
const unlockAudio = () => GameManager.audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('keydown', unlockAudio, { passive: true });

if (import.meta.env.DEV) {
  void import('./utils/debugHook').then((m) => m.installDebugHook(game));
}
