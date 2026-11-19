import type Phaser from 'phaser';
import { addDynamicCanvas, currentGeneration } from './TextureFactory';

export type SceneryTheme = 'menu' | 'lagoon' | 'candy' | 'grove' | 'peaks' | 'nebula';

type Ctx = CanvasRenderingContext2D;

/** Deterministic random so scenery is identical between rebuilds. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gradient(ctx: Ctx, w: number, h: number, stops: [number, string][]): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A filled band whose top edge is a sum of sines (sea, hills). */
function band(ctx: Ctx, w: number, h: number, baseY: number, amp: number, freq: number, phase: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += Math.max(2, w / 120)) {
    const y = baseY + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.35;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Jagged mountain range. */
function range(ctx: Ctx, w: number, h: number, baseY: number, peak: number, count: number, seed: number, color: string, snow?: string): void {
  const r = rng(seed);
  const pts: [number, number][] = [[0, baseY]];
  const step = w / count;
  for (let i = 0; i <= count; i++) {
    const x = i * step + (r() - 0.5) * step * 0.4;
    pts.push([x - step * 0.5, baseY - peak * (0.35 + r() * 0.25)]);
    pts.push([x, baseY - peak * (0.6 + r() * 0.4)]);
  }
  pts.push([w, baseY]);
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (snow) {
    ctx.fillStyle = snow;
    for (let i = 2; i < pts.length - 1; i += 2) {
      const [x, y] = pts[i];
      const cap = peak * 0.12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - cap * 0.9, y + cap);
      ctx.lineTo(x - cap * 0.3, y + cap * 0.8);
      ctx.lineTo(x, y + cap * 1.1);
      ctx.lineTo(x + cap * 0.4, y + cap * 0.75);
      ctx.lineTo(x + cap * 0.9, y + cap);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function grain(ctx: Ctx, w: number, h: number, seed: number): void {
  const r = rng(seed);
  const n = Math.round((w * h) / 90);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(r() * w, r() * h, 1, 1);
  }
}

const DRAW: Record<SceneryTheme, (ctx: Ctx, w: number, h: number, u: number) => void> = {
  menu(ctx, w, h, u) {
    gradient(ctx, w, h, [[0, '#2A2F63'], [1, '#121535']]);
    // Apothecary wallpaper: soft vertical stripes with a tiny diamond motif.
    const sw = 26 * u;
    for (let x = 0; x < w; x += sw * 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      ctx.fillRect(x, 0, sw, h);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = sw * 1.5; x < w; x += sw * 2) {
      for (let y = 18 * u; y < h; y += 46 * u) {
        ctx.beginPath();
        ctx.moveTo(x, y - 3 * u);
        ctx.lineTo(x + 3 * u, y);
        ctx.lineTo(x, y + 3 * u);
        ctx.lineTo(x - 3 * u, y);
        ctx.fill();
      }
    }
  },
  lagoon(ctx, w, h, u) {
    gradient(ctx, w, h, [[0, '#1C4A80'], [0.55, '#2A6FA4'], [0.62, '#163E6E'], [1, '#0A1B3A']]);
    // Low sun and its reflection.
    const sx = w * 0.72;
    const sy = h * 0.56;
    const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, 60 * u);
    sun.addColorStop(0, 'rgba(255,224,150,0.55)');
    sun.addColorStop(1, 'rgba(255,224,150,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(sx - 60 * u, sy - 60 * u, 120 * u, 120 * u);
    ctx.fillStyle = 'rgba(255,230,170,0.85)';
    ctx.beginPath();
    ctx.arc(sx, sy, 16 * u, Math.PI, 0);
    ctx.fill();
    band(ctx, w, h, h * 0.6, 3 * u, 0.02 / u, 0, '#17507F');
    ctx.fillStyle = 'rgba(255,230,170,0.25)';
    for (let i = 0; i < 6; i++) ctx.fillRect(sx - (18 - i * 2) * u, h * 0.61 + i * 9 * u, (36 - i * 4) * u, 2 * u);
    band(ctx, w, h, h * 0.7, 6 * u, 0.016 / u, 1.2, '#123F6A');
    band(ctx, w, h, h * 0.8, 8 * u, 0.012 / u, 2.6, '#0E3157');
    band(ctx, w, h, h * 0.9, 10 * u, 0.01 / u, 4.1, '#0A2343');
  },
  candy(ctx, w, h, u) {
    gradient(ctx, w, h, [[0, '#55245F'], [1, '#1B1032']]);
    // Polka dots.
    ctx.fillStyle = 'rgba(255,120,183,0.07)';
    const step = 34 * u;
    for (let y = 0, row = 0; y < h; y += step, row++) {
      for (let x = row % 2 ? step / 2 : 0; x < w; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 5 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Rolling candy hills.
    band(ctx, w, h, h * 0.76, 14 * u, 0.012 / u, 0.5, '#3E1748');
    band(ctx, w, h, h * 0.86, 12 * u, 0.017 / u, 2.1, '#2E1139');
    // Swirl lollipops on the hills.
    const r = rng(7);
    for (let i = 0; i < 4; i++) {
      const x = w * (0.1 + i * 0.27 + r() * 0.05);
      const y = h * 0.76 - 6 * u;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x - 1.5 * u, y, 3 * u, 30 * u);
      ctx.fillStyle = 'rgba(255,120,183,0.22)';
      ctx.beginPath();
      ctx.arc(x, y, 11 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.arc(x, y, 6 * u, 0, Math.PI * 1.5);
      ctx.stroke();
    }
  },
  grove(ctx, w, h, u) {
    gradient(ctx, w, h, [[0, '#164A43'], [1, '#081619']]);
    // Moon.
    ctx.fillStyle = 'rgba(230,255,220,0.18)';
    ctx.beginPath();
    ctx.arc(w * 0.2, h * 0.2, 26 * u, 0, Math.PI * 2);
    ctx.fill();
    band(ctx, w, h, h * 0.68, 22 * u, 0.008 / u, 0.3, '#12403A');
    // Lollipop trees on the far hill.
    const r = rng(11);
    for (let i = 0; i < 7; i++) {
      const x = (i + 0.3 + r() * 0.4) * (w / 7);
      const y = h * 0.68 - 10 * u + Math.sin(x * 0.008 / u + 0.3) * 22 * u;
      const s = (10 + r() * 8) * u;
      ctx.fillStyle = '#0F3631';
      ctx.fillRect(x - 1.5 * u, y - s * 0.4, 3 * u, s * 1.3);
      ctx.beginPath();
      ctx.arc(x, y - s * 0.9, s, 0, Math.PI * 2);
      ctx.fill();
    }
    band(ctx, w, h, h * 0.8, 16 * u, 0.011 / u, 1.9, '#0D302B');
    band(ctx, w, h, h * 0.9, 12 * u, 0.015 / u, 3.3, '#09231F');
  },
  peaks(ctx, w, h, u) {
    gradient(ctx, w, h, [[0, '#5A2E28'], [0.6, '#3A1E24'], [1, '#140C16']]);
    ctx.fillStyle = 'rgba(255,200,140,0.22)';
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.3, 34 * u, 0, Math.PI * 2);
    ctx.fill();
    range(ctx, w, h, h * 0.72, 150 * u, 4, 3, '#4A2630', 'rgba(255,235,220,0.35)');
    range(ctx, w, h, h * 0.82, 110 * u, 5, 9, '#33192A');
    range(ctx, w, h, h * 0.92, 70 * u, 7, 21, '#211120');
  },
  nebula(ctx, w, h, u) {
    gradient(ctx, w, h, [[0, '#2E1D63'], [1, '#08071E']]);
    const r = rng(5);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`;
      const s = r() < 0.9 ? 1 * u : 2 * u;
      ctx.fillRect(r() * w, r() * h, s, s);
    }
    // Ringed planet.
    const px = w * 0.82;
    const py = h * 0.24;
    const pr = 46 * u;
    const pg = ctx.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
    pg.addColorStop(0, '#B07CF0');
    pg.addColorStop(1, '#3A2580');
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,240,0.6)';
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.ellipse(px, py, pr * 1.7, pr * 0.42, -0.35, 0, Math.PI * 2);
    ctx.stroke();
    // Small far planet.
    ctx.fillStyle = '#59B8F5';
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(w * 0.14, h * 0.62, 14 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
};

/**
 * Full-screen illustrated backdrop for a theme, drawn once per size.
 * Rendered at half resolution: it sits behind everything and the slight
 * softness reads as depth.
 */
export function sceneryTexture(scene: Phaser.Scene, w: number, h: number, u: number, theme: SceneryTheme): string {
  const key = `dyn_scenery_${theme}_${Math.round(w)}x${Math.round(h)}_${currentGeneration()}`;
  if (scene.textures.exists(key)) return key;
  const k = 0.5;
  const c = document.createElement('canvas');
  c.width = Math.max(64, Math.round(w * k));
  c.height = Math.max(64, Math.round(h * k));
  const ctx = c.getContext('2d') as Ctx;
  DRAW[theme](ctx, c.width, c.height, u * k);
  grain(ctx, c.width, c.height, theme.length * 97);
  return addDynamicCanvas(scene, key, c);
}
