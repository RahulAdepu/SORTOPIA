import Phaser from 'phaser';
import { COLORS } from '../config/theme';
import { layoutOf } from '../config/layout';
import { GameManager } from '../systems/GameManager';
import { sceneryTexture } from './Scenery';

export type BgTheme = 'menu' | 'lagoon' | 'candy' | 'grove' | 'peaks' | 'nebula';
type Fx = 'bubbles' | 'sprinkles' | 'fireflies' | 'embers' | 'stars';

interface ThemeDef {
  top: number;
  bottom: number;
  accent: number;
  orbs: number[];
  fx: Fx;
}

/** One look per chapter (and the menu), so progress feels like travelling somewhere. */
export const BG_THEMES: Record<BgTheme, ThemeDef> = {
  menu: { top: COLORS.bgTop, bottom: COLORS.bgDeep, accent: COLORS.purple, orbs: [COLORS.purple, COLORS.pink, COLORS.blue, COLORS.green, COLORS.yellow], fx: 'bubbles' },
  lagoon: { top: 0x1b3f73, bottom: 0x0b1530, accent: COLORS.blue, orbs: [0x59b8f5, 0x13a69a, 0x62d6a5, 0x3b5bdb], fx: 'bubbles' },
  candy: { top: 0x4a2158, bottom: 0x170f2e, accent: COLORS.pink, orbs: [0xff78b7, 0xffd166, 0x9b72f2, 0xff9865], fx: 'sprinkles' },
  grove: { top: 0x14443d, bottom: 0x0a1722, accent: COLORS.green, orbs: [0x62d6a5, 0xb5e14a, 0x13a69a, 0x59b8f5], fx: 'fireflies' },
  peaks: { top: 0x4d2a24, bottom: 0x150d18, accent: COLORS.orange, orbs: [0xff9865, 0xffd166, 0xe8435a, 0xff78b7], fx: 'embers' },
  nebula: { top: 0x2b1b5e, bottom: 0x090820, accent: COLORS.purple, orbs: [0x9b72f2, 0x3b5bdb, 0xff78b7, 0x59b8f5], fx: 'stars' },
};

/**
 * Layered animated backdrop: gradient + drifting colour orbs + a themed
 * ambient effect. Motion is disabled under the reduced-motion preference.
 */
export function createBackground(scene: Phaser.Scene, _accent: number = COLORS.purple, opts: { bubbles?: number; theme?: BgTheme } = {}): Phaser.GameObjects.Container {
  const L = layoutOf(scene);
  const themeId = opts.theme ?? 'menu';
  const theme = BG_THEMES[themeId];
  const c = scene.add.container(0, 0).setDepth(-100);
  const bg = scene.add.image(L.cx, L.cy, sceneryTexture(scene, L.w, L.h, L.u, themeId));
  bg.setDisplaySize(L.w, L.h);
  c.add(bg);
  if (!GameManager.save.settings.reducedMotion) addAmbient(scene, c, theme, opts.bubbles ?? 14, L);
  return c;
}

function addAmbient(scene: Phaser.Scene, c: Phaser.GameObjects.Container, theme: ThemeDef, count: number, L: ReturnType<typeof layoutOf>): void {
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  for (let i = 0; i < count; i++) {
    switch (theme.fx) {
      case 'bubbles': {
        const s = rnd(6, 22) * L.u;
        const b = scene.add.image(rnd(0, L.w), rnd(0, L.h * 2), 'bubble').setDisplaySize(s, s).setAlpha(rnd(0.35, 0.65));
        c.add(b);
        const rise = () => {
          b.setPosition(rnd(0, L.w), L.h + 20 * L.u);
          scene.tweens.add({ targets: b, y: -30 * L.u, x: b.x + rnd(-30, 30) * L.u, duration: rnd(9000, 18000), ease: 'Sine.easeIn', onComplete: rise });
        };
        scene.tweens.add({ targets: b, y: -30 * L.u, duration: Math.max(1000, (b.y / L.h) * 9000 + 3000), onComplete: rise });
        break;
      }
      case 'sprinkles': {
        const p = scene.add
          .image(rnd(0, L.w), rnd(-L.h, L.h), 'confetti')
          .setScale(rnd(0.5, 0.9) * L.u)
          .setTint(theme.orbs[i % theme.orbs.length])
          .setAlpha(rnd(0.4, 0.7))
          .setAngle(rnd(0, 360));
        c.add(p);
        const fall = () => {
          p.setPosition(rnd(0, L.w), -20 * L.u);
          scene.tweens.add({ targets: p, y: L.h + 20 * L.u, x: p.x + rnd(-40, 40) * L.u, angle: p.angle + rnd(-360, 360), duration: rnd(10000, 18000), onComplete: fall });
        };
        scene.tweens.add({ targets: p, y: L.h + 20 * L.u, angle: p.angle + 180, duration: Math.max(1000, ((L.h - p.y) / L.h) * 12000), onComplete: fall });
        break;
      }
      case 'fireflies': {
        const f = scene.add.image(rnd(0, L.w), rnd(0, L.h), 'glow').setDisplaySize(10 * L.u, 10 * L.u).setTint(0xd8ff8a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2);
        c.add(f);
        const wander = () => scene.tweens.add({ targets: f, x: f.x + rnd(-80, 80) * L.u, y: f.y + rnd(-60, 60) * L.u, duration: rnd(3000, 6000), ease: 'Sine.easeInOut', onComplete: wander });
        wander();
        scene.tweens.add({ targets: f, alpha: rnd(0.6, 0.95), duration: rnd(900, 1800), yoyo: true, repeat: -1, delay: rnd(0, 1500) });
        break;
      }
      case 'embers': {
        const e = scene.add.image(rnd(0, L.w), rnd(0, L.h), 'dot').setScale(rnd(0.12, 0.28) * L.u).setTint(i % 2 ? 0xffb366 : 0xff7a45).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        c.add(e);
        const rise = () => {
          e.setPosition(rnd(0, L.w), L.h + 10 * L.u).setAlpha(0);
          scene.tweens.add({ targets: e, y: rnd(0.1, 0.6) * L.h, x: e.x + rnd(-50, 50) * L.u, duration: rnd(5000, 9000), ease: 'Quad.easeOut', onComplete: rise });
          scene.tweens.add({ targets: e, alpha: { from: 0, to: 0.9 }, duration: 1500, yoyo: true, hold: 1500 });
        };
        scene.time.delayedCall(rnd(0, 4000), rise);
        break;
      }
      case 'stars': {
        const st = scene.add.image(rnd(0, L.w), rnd(0, L.h), 'spark').setScale(rnd(0.15, 0.4) * L.u).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3);
        c.add(st);
        scene.tweens.add({ targets: st, alpha: rnd(0.7, 1), scale: st.scale * 1.4, angle: 45, duration: rnd(1200, 2600), yoyo: true, repeat: -1, delay: rnd(0, 2000), ease: 'Sine.easeInOut' });
        break;
      }
    }
  }
}

/** Background theme for a chapter-based level number. */
export function themeForLevel(level: number): BgTheme {
  if (level <= 10) return 'lagoon';
  if (level <= 25) return 'candy';
  if (level <= 50) return 'grove';
  if (level <= 75) return 'peaks';
  return 'nebula';
}
