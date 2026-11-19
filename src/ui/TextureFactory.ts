import Phaser from 'phaser';
import { bottleGeometry, type BottleGeometry } from '../entities/Liquid';
import { FONT, hexToCss, shade } from '../config/theme';
import { BOTTLE_STYLES, type BottleStyle } from '../data/catalog';

/**
 * Every visual asset in Sortopia is drawn procedurally with Canvas 2D at the
 * exact device resolution it will be shown at. No image files, no blur.
 *
 * Size-dependent ("dynamic") textures are tagged with a generation number;
 * after a viewport resize, older generations are purged.
 */
let generation = 0;
const dynamicKeys = new Map<string, number>();

export function bumpGeneration(): number {
  return ++generation;
}

export function purgeOldTextures(textures: Phaser.Textures.TextureManager): void {
  for (const [key, gen] of dynamicKeys) {
    if (gen < generation && textures.exists(key)) {
      textures.remove(key);
      dynamicKeys.delete(key);
    }
  }
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

/** Register a canvas as a resize-scoped texture (purged after the next resize). */
export function addDynamicCanvas(scene: Phaser.Scene, key: string, c: HTMLCanvasElement): string {
  return add(scene, key, c, true);
}

export function currentGeneration(): number {
  return generation;
}

function add(scene: Phaser.Scene, key: string, c: HTMLCanvasElement, dynamic: boolean): string {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
  if (dynamic) dynamicKeys.set(key, generation);
  return key;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// ------------------------------------------------------------------ static

const ICON = 128;

type IconDraw = (ctx: CanvasRenderingContext2D) => void;

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points = 5): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function arrowArc(ctx: CanvasRenderingContext2D, ccw: boolean, start: number, end: number): void {
  const cx = 64;
  const cy = 66;
  const r = 36;
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end, ccw);
  ctx.stroke();
  const a = start;
  const px = cx + Math.cos(a) * r;
  const py = cy + Math.sin(a) * r;
  // Arrow head tangent to the arc at the start point.
  const dir = ccw ? 1 : -1;
  const tx = -Math.sin(a) * dir;
  const ty = Math.cos(a) * dir;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  ctx.beginPath();
  ctx.moveTo(px - tx * 20, py - ty * 20);
  ctx.lineTo(px + nx * 17, py + ny * 17);
  ctx.lineTo(px - nx * 17, py - ny * 17);
  ctx.closePath();
  ctx.fill();
}

const ICONS: Record<string, IconDraw> = {
  'icon-pause': (c) => {
    rr(c, 36, 28, 20, 72, 8);
    c.fill();
    rr(c, 72, 28, 20, 72, 8);
    c.fill();
  },
  'icon-play': (c) => {
    c.beginPath();
    c.moveTo(44, 26);
    c.lineTo(102, 64);
    c.lineTo(44, 102);
    c.closePath();
    c.lineJoin = 'round';
    c.lineWidth = 14;
    c.stroke();
    c.fill();
  },
  'icon-undo': (c) => arrowArc(c, false, Math.PI * 1.02, Math.PI * 0.25),
  'icon-restart': (c) => arrowArc(c, false, -Math.PI * 0.35, Math.PI * 1.25),
  'icon-hint': (c) => {
    c.beginPath();
    c.arc(64, 54, 30, Math.PI * 0.8, Math.PI * 2.2);
    c.lineTo(78, 88);
    c.lineTo(50, 88);
    c.closePath();
    c.fill();
    rr(c, 48, 94, 32, 9, 4);
    c.fill();
    rr(c, 52, 107, 24, 9, 4);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(56, 50, 12, Math.PI, Math.PI * 1.5);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
  },
  'icon-home': (c) => {
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(18, 62);
    c.lineTo(64, 22);
    c.lineTo(110, 62);
    c.stroke();
    rr(c, 32, 56, 64, 52, 8);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    rr(c, 54, 76, 20, 32, 4);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  },
  'icon-settings': (c) => {
    c.save();
    c.translate(64, 64);
    for (let i = 0; i < 8; i++) {
      c.rotate(Math.PI / 4);
      rr(c, -10, -50, 20, 24, 5);
      c.fill();
    }
    c.restore();
    c.beginPath();
    c.arc(64, 64, 34, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(64, 64, 14, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  },
  'icon-trophy': (c) => {
    c.beginPath();
    c.moveTo(36, 22);
    c.lineTo(92, 22);
    c.lineTo(88, 58);
    c.quadraticCurveTo(64, 84, 40, 58);
    c.closePath();
    c.fill();
    c.lineWidth = 9;
    c.beginPath();
    c.arc(34, 42, 14, Math.PI * 0.5, Math.PI * 1.5);
    c.stroke();
    c.beginPath();
    c.arc(94, 42, 14, -Math.PI * 0.5, Math.PI * 0.5);
    c.stroke();
    rr(c, 56, 70, 16, 24, 3);
    c.fill();
    rr(c, 38, 92, 52, 16, 6);
    c.fill();
  },
  'icon-calendar': (c) => {
    rr(c, 18, 28, 92, 82, 14);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    rr(c, 28, 52, 72, 48, 6);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    rr(c, 36, 16, 12, 24, 6);
    c.fill();
    rr(c, 80, 16, 12, 24, 6);
    c.fill();
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
      rr(c, 38 + k * 20, 60 + r * 18, 12, 11, 3);
      c.fill();
    }
  },
  'icon-timer': (c) => {
    c.lineWidth = 11;
    c.beginPath();
    c.arc(64, 72, 38, 0, Math.PI * 2);
    c.stroke();
    rr(c, 52, 14, 24, 12, 5);
    c.fill();
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(64, 72);
    c.lineTo(64, 48);
    c.moveTo(64, 72);
    c.lineTo(80, 82);
    c.stroke();
  },
  'icon-moves': (c) => {
    // A droplet with a counter tick (Limited Moves).
    c.beginPath();
    c.moveTo(64, 14);
    c.bezierCurveTo(64, 14, 28, 58, 28, 80);
    c.arc(64, 80, 36, Math.PI, 0, true);
    c.bezierCurveTo(100, 58, 64, 14, 64, 14);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(48, 84);
    c.lineTo(60, 96);
    c.lineTo(82, 70);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
  },
  'icon-leaf': (c) => {
    c.beginPath();
    c.moveTo(22, 106);
    c.bezierCurveTo(16, 50, 56, 20, 108, 20);
    c.bezierCurveTo(108, 72, 80, 110, 22, 106);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(30, 98);
    c.quadraticCurveTo(62, 66, 90, 38);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
  },
  'icon-lock': (c) => {
    c.lineWidth = 13;
    c.beginPath();
    c.arc(64, 50, 24, Math.PI, 0);
    c.lineTo(88, 62);
    c.moveTo(40, 62);
    c.lineTo(40, 50);
    c.stroke();
    rr(c, 26, 58, 76, 56, 14);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(64, 80, 8, 0, Math.PI * 2);
    c.fill();
    rr(c, 60, 82, 8, 16, 3);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  },
  'icon-check': (c) => {
    c.lineWidth = 18;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(26, 66);
    c.lineTo(52, 92);
    c.lineTo(102, 38);
    c.stroke();
  },
  'icon-close': (c) => {
    c.lineWidth = 16;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(34, 34);
    c.lineTo(94, 94);
    c.moveTo(94, 34);
    c.lineTo(34, 94);
    c.stroke();
  },
  'icon-back': (c) => {
    c.lineWidth = 16;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(76, 26);
    c.lineTo(38, 64);
    c.lineTo(76, 102);
    c.stroke();
  },
  'icon-next': (c) => {
    c.lineWidth = 16;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(52, 26);
    c.lineTo(90, 64);
    c.lineTo(52, 102);
    c.stroke();
  },
  'icon-map': (c) => {
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(16, 30);
    c.lineTo(46, 20);
    c.lineTo(82, 32);
    c.lineTo(112, 22);
    c.lineTo(112, 98);
    c.lineTo(82, 108);
    c.lineTo(46, 96);
    c.lineTo(16, 106);
    c.closePath();
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(46, 24);
    c.lineTo(46, 94);
    c.moveTo(82, 36);
    c.lineTo(82, 104);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
  },
  'icon-flame': (c) => {
    c.beginPath();
    c.moveTo(64, 10);
    c.bezierCurveTo(78, 40, 104, 52, 100, 82);
    c.bezierCurveTo(96, 106, 78, 118, 64, 118);
    c.bezierCurveTo(44, 118, 26, 104, 28, 80);
    c.bezierCurveTo(30, 60, 44, 54, 46, 36);
    c.bezierCurveTo(56, 46, 58, 54, 58, 62);
    c.bezierCurveTo(66, 48, 66, 30, 64, 10);
    c.fill();
  },
  'icon-star': (c) => {
    star(c, 64, 68, 54, 24);
    c.lineJoin = 'round';
    c.lineWidth = 8;
    c.stroke();
    c.fill();
  },
  'icon-music': (c) => {
    c.beginPath();
    c.ellipse(40, 94, 18, 14, -0.4, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(92, 82, 18, 14, -0.4, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 10;
    c.beginPath();
    c.moveTo(54, 92);
    c.lineTo(54, 30);
    c.lineTo(106, 18);
    c.lineTo(106, 80);
    c.stroke();
    c.lineWidth = 14;
    c.beginPath();
    c.moveTo(54, 36);
    c.lineTo(106, 24);
    c.stroke();
  },
  'icon-sound': (c) => {
    c.beginPath();
    c.moveTo(18, 48);
    c.lineTo(40, 48);
    c.lineTo(68, 22);
    c.lineTo(68, 106);
    c.lineTo(40, 80);
    c.lineTo(18, 80);
    c.closePath();
    c.fill();
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(70, 64, 22, -0.8, 0.8);
    c.stroke();
    c.beginPath();
    c.arc(70, 64, 40, -0.8, 0.8);
    c.stroke();
  },
  'icon-vibrate': (c) => {
    rr(c, 40, 16, 48, 96, 12);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    rr(c, 48, 28, 32, 66, 4);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    c.lineWidth = 8;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(24, 44);
    c.lineTo(24, 84);
    c.moveTo(104, 44);
    c.lineTo(104, 84);
    c.moveTo(10, 54);
    c.lineTo(10, 74);
    c.moveTo(118, 54);
    c.lineTo(118, 74);
    c.stroke();
  },
  'icon-eye': (c) => {
    c.beginPath();
    c.moveTo(10, 64);
    c.quadraticCurveTo(64, 0, 118, 64);
    c.quadraticCurveTo(64, 128, 10, 64);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(64, 64, 24, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    c.beginPath();
    c.arc(64, 64, 13, 0, Math.PI * 2);
    c.fill();
  },
  'icon-text': (c) => {
    c.font = `700 84px ${FONT.family}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('Aa', 64, 70);
  },
  'icon-motion': (c) => {
    c.lineWidth = 10;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      const y = 36 + i * 28;
      c.moveTo(18, y);
      c.bezierCurveTo(44, y - 18, 64, y + 18, 110, y);
      c.stroke();
    }
  },
  'icon-info': (c) => {
    c.lineWidth = 10;
    c.beginPath();
    c.arc(64, 64, 48, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(64, 38, 8, 0, Math.PI * 2);
    c.fill();
    rr(c, 57, 54, 14, 42, 6);
    c.fill();
  },
  'icon-gift': (c) => {
    rr(c, 20, 52, 88, 58, 8);
    c.fill();
    rr(c, 14, 38, 100, 22, 8);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.fillRect(58, 38, 12, 72);
    c.globalCompositeOperation = 'source-over';
    c.lineWidth = 8;
    c.beginPath();
    c.ellipse(48, 28, 16, 10, 0.4, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.ellipse(80, 28, 16, 10, -0.4, 0, Math.PI * 2);
    c.stroke();
  },
  'icon-drop': (c) => {
    c.beginPath();
    c.moveTo(64, 10);
    c.bezierCurveTo(64, 10, 26, 58, 26, 82);
    c.arc(64, 82, 38, Math.PI, 0, true);
    c.bezierCurveTo(102, 58, 64, 10, 64, 10);
    c.fill();
  },
  'icon-snow': (c) => {
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.save();
    c.translate(64, 64);
    for (let i = 0; i < 6; i++) {
      c.rotate(Math.PI / 3);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -50);
      c.moveTo(0, -30);
      c.lineTo(-13, -42);
      c.moveTo(0, -30);
      c.lineTo(13, -42);
      c.stroke();
    }
    c.restore();
  },
  'icon-shop': (c) => {
    c.lineJoin = 'round';
    rr(c, 20, 44, 88, 70, 14);
    c.fill();
    c.lineWidth = 10;
    c.beginPath();
    c.arc(64, 46, 22, Math.PI, 0);
    c.stroke();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(46, 62, 6, 0, Math.PI * 2);
    c.arc(82, 62, 6, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  },
  'icon-bottle-plus': (c) => {
    c.lineWidth = 9;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(30, 16);
    c.lineTo(30, 92);
    c.arc(50, 92, 20, Math.PI, 0, true);
    c.lineTo(70, 16);
    c.stroke();
    rr(c, 22, 10, 56, 12, 6);
    c.fill();
    c.lineWidth = 12;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(102, 50);
    c.lineTo(102, 94);
    c.moveTo(80, 72);
    c.lineTo(124, 72);
    c.stroke();
  },
  'icon-hand': (c) => {
    // Pointing hand used by the tutorial.
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(50, 12);
    c.quadraticCurveTo(62, 6, 64, 20);
    c.lineTo(64, 56);
    c.lineTo(96, 62);
    c.quadraticCurveTo(110, 66, 106, 84);
    c.lineTo(98, 108);
    c.quadraticCurveTo(94, 118, 82, 118);
    c.lineTo(54, 118);
    c.quadraticCurveTo(44, 118, 38, 108);
    c.lineTo(22, 80);
    c.quadraticCurveTo(18, 70, 28, 68);
    c.quadraticCurveTo(36, 66, 40, 74);
    c.lineTo(44, 78);
    c.lineTo(44, 20);
    c.quadraticCurveTo(44, 14, 50, 12);
    c.closePath();
    c.fill();
  },
};

function makeIcon(scene: Phaser.Scene, key: string, draw: IconDraw): void {
  const [c, ctx] = canvas(ICON, ICON);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 10;
  draw(ctx);
  add(scene, key, c, false);
}

function makeRadial(scene: Phaser.Scene, key: string, size: number, stops: [number, string][]): void {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  add(scene, key, c, false);
}

function makeStar(scene: Phaser.Scene, key: string, filled: boolean): void {
  const S = 160;
  const [c, ctx] = canvas(S, S);
  ctx.lineJoin = 'round';
  if (filled) {
    ctx.shadowColor = 'rgba(255,170,40,0.55)';
    ctx.shadowBlur = 16;
    star(ctx, S / 2, S / 2 + 4, 66, 30);
    const g = ctx.createLinearGradient(0, 14, 0, S - 10);
    g.addColorStop(0, '#FFF1A8');
    g.addColorStop(0.45, '#FFD166');
    g.addColorStop(1, '#F59E2B');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#C86E14';
    ctx.stroke();
    // inner gloss
    ctx.save();
    star(ctx, S / 2, S / 2 + 4, 66, 30);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(S / 2 - 12, S / 2 - 22, 36, 18, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    star(ctx, S / 2, S / 2 + 4, 66, 30);
    ctx.fillStyle = 'rgba(10,12,40,0.55)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(170,176,224,0.35)';
    ctx.stroke();
  }
  add(scene, key, c, false);
}

function makeCoin(scene: Phaser.Scene): void {
  const S = 96;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#FFE58A');
  g.addColorStop(0.5, '#FFC94A');
  g.addColorStop(1, '#E08A1E');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#B9650F';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 32, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(185,101,15,0.6)';
  ctx.lineWidth = 4;
  ctx.stroke();
  // embossed droplet
  ctx.fillStyle = 'rgba(185,101,15,0.75)';
  ctx.beginPath();
  ctx.moveTo(48, 26);
  ctx.bezierCurveTo(48, 26, 34, 46, 34, 56);
  ctx.arc(48, 56, 14, Math.PI, 0, true);
  ctx.bezierCurveTo(62, 46, 48, 26, 48, 26);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(36, 30, 14, 7, -0.6, 0, Math.PI * 2);
  ctx.fill();
  add(scene, 'coin', c, false);
}

function makeSpark(scene: Phaser.Scene): void {
  const S = 64;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  star(ctx, 32, 32, 32, 5, 4);
  ctx.fill();
  add(scene, 'spark', c, false);
}

/** Create all resolution-independent textures (icons, particles, stars, coins). */
export function createStaticTextures(scene: Phaser.Scene): void {
  for (const [key, draw] of Object.entries(ICONS)) makeIcon(scene, key, draw);
  makeRadial(scene, 'glow', 128, [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.45)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  makeRadial(scene, 'orb', 256, [
    [0, 'rgba(255,255,255,0.55)'],
    [0.5, 'rgba(255,255,255,0.18)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  makeRadial(scene, 'dot', 32, [
    [0, 'rgba(255,255,255,1)'],
    [0.7, 'rgba(255,255,255,1)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  makeSpark(scene);
  makeStar(scene, 'star-full', true);
  makeStar(scene, 'star-empty', false);
  makeCoin(scene);
  {
    const [c, ctx] = canvas(24, 14);
    rr(ctx, 0, 0, 24, 14, 4);
    ctx.fillStyle = '#fff';
    ctx.fill();
    add(scene, 'confetti', c, false);
  }
  {
    const [c, ctx] = canvas(128, 128);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.stroke();
    add(scene, 'ring', c, false);
  }
  {
    // Bubble with rim light, used in liquids and backgrounds.
    const S = 64;
    const [c, ctx] = canvas(S, S);
    const g = ctx.createRadialGradient(26, 24, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.12)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    add(scene, 'bubble', c, false);
  }
}

// ----------------------------------------------------------------- dynamic

export interface PanelStyle {
  top: number;
  bottom: number;
  stroke?: number;
  strokeAlpha?: number;
  radius: number;
  /** Raised 3-D lip height (buttons). */
  lip?: number;
  lipColor?: number;
  shadow?: boolean;
  gloss?: boolean;
  alpha?: number;
}

/** Rounded panel / button body with gradient, gloss and optional 3-D lip. */
export function panelTexture(scene: Phaser.Scene, w: number, h: number, style: PanelStyle): string {
  const key = `dyn_panel_${Math.round(w)}x${Math.round(h)}_${style.top}_${style.bottom}_${style.stroke ?? 'n'}_${style.radius | 0}_${style.lip ?? 0}_${style.shadow ? 1 : 0}_${style.gloss ? 1 : 0}_${style.alpha ?? 1}_${generation}`;
  if (scene.textures.exists(key)) return key;
  const pad = style.shadow ? Math.ceil(h * 0.12) + 4 : 4;
  const [c, ctx] = canvas(w + pad * 2, h + pad * 2);
  const lip = style.lip ?? 0;
  const x = pad;
  const y = pad;
  const bodyH = h - lip;
  // Pressable things (they have a lip) get the "toy" treatment: a dark ink
  // outline around the whole shape. Flat panels keep their optional stroke.
  const ink = lip > 0 ? Math.max(1.5, h * 0.045) : 0;
  ctx.globalAlpha = style.alpha ?? 1;
  if (style.shadow) {
    // Hard offset shadow (depth reads from the offset, not from a blur halo).
    rr(ctx, x, y + Math.max(2, h * 0.07), w, h, style.radius);
    ctx.fillStyle = 'rgba(6,7,26,0.42)';
    ctx.fill();
  }
  if (ink) {
    rr(ctx, x - ink / 2, y - ink / 2, w + ink, h + ink, style.radius + ink / 2);
    ctx.fillStyle = '#10132E';
    ctx.fill();
  }
  if (lip > 0) {
    rr(ctx, x, y + lip, w, bodyH, style.radius);
    ctx.fillStyle = hexToCss(style.lipColor ?? shade(style.bottom, -0.35));
    ctx.fill();
  }
  rr(ctx, x, y, w, bodyH, style.radius);
  const g = ctx.createLinearGradient(0, y, 0, y + bodyH);
  g.addColorStop(0, hexToCss(style.top));
  g.addColorStop(1, hexToCss(style.bottom));
  ctx.fillStyle = g;
  ctx.fill();
  if (style.gloss) {
    // A single crisp highlight stripe near the top edge instead of a gloss wash.
    const inset = Math.min(style.radius * 0.75, w * 0.2);
    const sw = Math.max(1.5, bodyH * 0.075);
    ctx.lineCap = 'round';
    ctx.lineWidth = sw;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(x + inset, y + sw * 1.4);
    ctx.lineTo(x + w - inset - Math.min(bodyH * 0.35, w * 0.25), y + sw * 1.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w - inset, y + sw * 1.4, sw * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
  }
  if (style.stroke !== undefined) {
    rr(ctx, x + 1, y + 1, w - 2, bodyH - 2, style.radius);
    ctx.lineWidth = Math.max(1.5, h * 0.025);
    ctx.strokeStyle = hexToCss(style.stroke, style.strokeAlpha ?? 1);
    ctx.stroke();
  }
  return add(scene, key, c, true);
}

/** Full-screen vertical background gradient with a soft vignette. */
export function backgroundTexture(scene: Phaser.Scene, w: number, h: number, top: number, bottom: number, accent: number): string {
  const key = `dyn_bg_${Math.round(w)}x${Math.round(h)}_${top}_${bottom}_${accent}_${generation}`;
  if (scene.textures.exists(key)) return key;
  // Gradients scale smoothly, so render at reduced size and stretch.
  const cw = Math.max(64, Math.round(w / 4));
  const ch = Math.max(64, Math.round(h / 4));
  const [c, ctx] = canvas(cw, ch);
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, hexToCss(top));
  g.addColorStop(1, hexToCss(bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  const a = ctx.createRadialGradient(cw * 0.5, ch * 0.28, 0, cw * 0.5, ch * 0.28, Math.max(cw, ch) * 0.75);
  a.addColorStop(0, hexToCss(accent, 0.22));
  a.addColorStop(1, hexToCss(accent, 0));
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, cw, ch);
  const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(4,5,18,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, cw, ch);
  return add(scene, key, c, true);
}

function bottlePath(ctx: CanvasRenderingContext2D, geo: BottleGeometry, ox: number, oy: number, inset = 0): void {
  const W = geo.W - inset * 2;
  const top = -geo.H / 2 + geo.lipH * 0.5 + inset;
  const bottom = geo.H / 2 - inset;
  const r = W * 0.48;
  ctx.beginPath();
  ctx.moveTo(ox - W / 2, oy + top);
  ctx.lineTo(ox - W / 2, oy + bottom - r);
  ctx.ellipse(ox, oy + bottom - r, W / 2, r, 0, Math.PI, 0, true);
  ctx.lineTo(ox + W / 2, oy + top);
  ctx.closePath();
}

function interiorPath(ctx: CanvasRenderingContext2D, geo: BottleGeometry, ox: number, oy: number): void {
  ctx.beginPath();
  geo.interior.forEach((p, i) => (i === 0 ? ctx.moveTo(ox + p.x, oy + p.y) : ctx.lineTo(ox + p.x, oy + p.y)));
  ctx.closePath();
}

export interface BottleTextures {
  back: string;
  front: string;
  glow: string;
  cork: string;
  geo: BottleGeometry;
  /** Texture canvas origin offset (texture is centred on the bottle). */
}

/** Glass container art for a given size: back pane, front reflections, selection glow, cork. */
export function bottleTextures(scene: Phaser.Scene, W: number, H: number, styleId = 'classic'): BottleTextures {
  const geo = bottleGeometry(W, H);
  const style: BottleStyle = BOTTLE_STYLES.find((b) => b.id === styleId) ?? BOTTLE_STYLES[0];
  const id = `${Math.round(W)}x${Math.round(H)}_${style.id}_${generation}`;
  const back = `dyn_bottle_back_${id}`;
  const front = `dyn_bottle_front_${id}`;
  const glow = `dyn_bottle_glow_${id}`;
  const cork = `dyn_bottle_cork_${id}`;
  if (scene.textures.exists(front)) return { back, front, glow, cork, geo };

  const pad = Math.ceil(W * 0.3);
  const cw = W + pad * 2;
  const ch = H + pad * 2;
  const ox = cw / 2;
  const oy = ch / 2;

  // --- back pane: faint tinted glass + inner depth
  {
    const [c, ctx] = canvas(cw, ch);
    if (style.halo) {
      ctx.save();
      ctx.shadowColor = style.halo;
      ctx.shadowBlur = W * 0.35;
      bottlePath(ctx, geo, ox, oy);
      ctx.strokeStyle = style.halo;
      ctx.lineWidth = W * 0.05;
      ctx.stroke();
      ctx.restore();
    }
    bottlePath(ctx, geo, ox, oy);
    const g = ctx.createLinearGradient(ox - W / 2, 0, ox + W / 2, 0);
    g.addColorStop(0, style.tint[0]);
    g.addColorStop(0.5, style.tint[1]);
    g.addColorStop(1, style.tint[0]);
    ctx.fillStyle = g;
    ctx.fill();
    interiorPath(ctx, geo, ox, oy);
    ctx.fillStyle = 'rgba(8,10,34,0.38)';
    ctx.fill();
    add(scene, back, c, true);
  }

  // --- front: rim light, cylindrical shading, reflections, lip
  {
    const [c, ctx] = canvas(cw, ch);
    const iw = geo.innerW;
    // cylindrical shading over the liquid
    ctx.save();
    interiorPath(ctx, geo, ox, oy);
    ctx.clip();
    const sh = ctx.createLinearGradient(ox - iw / 2, 0, ox + iw / 2, 0);
    sh.addColorStop(0, 'rgba(10,8,40,0.30)');
    sh.addColorStop(0.18, 'rgba(255,255,255,0.06)');
    sh.addColorStop(0.32, 'rgba(255,255,255,0.0)');
    sh.addColorStop(0.78, 'rgba(10,8,40,0.0)');
    sh.addColorStop(1, 'rgba(10,8,40,0.34)');
    ctx.fillStyle = sh;
    ctx.fillRect(ox - W, oy - H, W * 2, H * 2);
    // main reflection streak
    const sx = ox - iw / 2 + iw * 0.13;
    const sTop = oy + geo.innerTop + (geo.innerBottom - geo.innerTop) * 0.07;
    const sBot = oy + geo.innerBottom - geo.radius * 0.75;
    const streak = ctx.createLinearGradient(0, sTop, 0, sBot);
    streak.addColorStop(0, 'rgba(255,255,255,0.62)');
    streak.addColorStop(0.6, 'rgba(255,255,255,0.28)');
    streak.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = streak;
    rr(ctx, sx, sTop, iw * 0.13, sBot - sTop, iw * 0.07);
    ctx.fill();
    // small secondary dot + right edge glint
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(sx + iw * 0.065, sBot + iw * 0.14, iw * 0.05, iw * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    const rx = ox + iw / 2 - iw * 0.16;
    const rg = ctx.createLinearGradient(0, sTop, 0, sTop + (sBot - sTop) * 0.6);
    rg.addColorStop(0, 'rgba(255,255,255,0.32)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    rr(ctx, rx, sTop + iw * 0.2, iw * 0.06, (sBot - sTop) * 0.55, iw * 0.03);
    ctx.fill();
    // bottom caustic
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(1.5, W * 0.035);
    ctx.beginPath();
    ctx.ellipse(ox, oy + geo.innerBottom - geo.radius, iw * 0.34, geo.radius * 0.72, 0, Math.PI * 0.25, Math.PI * 0.75);
    ctx.stroke();
    ctx.restore();

    // glass outline (thick, bright) + inner edge
    bottlePath(ctx, geo, ox, oy, geo.wall * 0.3);
    ctx.lineWidth = Math.max(2, geo.wall * 0.9);
    const og = ctx.createLinearGradient(ox - W / 2, oy - H / 2, ox + W / 2, oy + H / 2);
    style.rim.forEach((c, i) => og.addColorStop(i / Math.max(1, style.rim.length - 1), c));
    ctx.strokeStyle = og;
    ctx.stroke();
    if (style.frost) {
      // Frost speckles scattered over the glass (deterministic pattern).
      ctx.save();
      bottlePath(ctx, geo, ox, oy);
      ctx.clip();
      ctx.fillStyle = 'rgba(235,250,255,0.55)';
      for (let i = 0; i < 26; i++) {
        const fx = ox - W / 2 + (((i * 37) % 100) / 100) * W;
        const fy = oy - H / 2 + (((i * 61) % 100) / 100) * H;
        ctx.beginPath();
        ctx.arc(fx, fy, Math.max(0.8, W * (0.012 + ((i * 13) % 5) * 0.004)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    interiorPath(ctx, geo, ox, oy);
    ctx.lineWidth = Math.max(1, W * 0.012);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke();

    // lip / rim
    const lipX = ox - geo.lipW / 2;
    const lipY = oy - H / 2;
    rr(ctx, lipX, lipY, geo.lipW, geo.lipH, geo.lipH / 2);
    const lg = ctx.createLinearGradient(0, lipY, 0, lipY + geo.lipH);
    lg.addColorStop(0, style.lip[0]);
    lg.addColorStop(1, style.lip[1]);
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.lineWidth = Math.max(1, W * 0.02);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(30,30,80,0.18)';
    rr(ctx, lipX + geo.lipW * 0.08, lipY + geo.lipH * 0.58, geo.lipW * 0.84, geo.lipH * 0.22, geo.lipH * 0.1);
    ctx.fill();
    add(scene, front, c, true);
  }

  // --- selection outline: a crisp ring around the glass (tinted at runtime), no blur halo
  {
    const [c, ctx] = canvas(cw, ch);
    bottlePath(ctx, geo, ox, oy, -W * 0.09);
    ctx.lineWidth = W * 0.07;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    add(scene, glow, c, true);
  }

  // --- cork stopper for completed containers
  {
    const cwid = geo.innerW * 1.02;
    const chgt = geo.lipH * 1.9;
    const [c, ctx] = canvas(cwid + 8, chgt + 8);
    const x = 4;
    const y = 4;
    rr(ctx, x, y, cwid, chgt, cwid * 0.18);
    const g = ctx.createLinearGradient(x, 0, x + cwid, 0);
    g.addColorStop(0, '#B97A4A');
    g.addColorStop(0.35, '#E3B07A');
    g.addColorStop(1, '#8E5530');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(80,40,15,0.8)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(90,45,20,0.35)';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(x + cwid * (0.15 + ((i * 37) % 70) / 100), y + chgt * (0.25 + ((i * 53) % 55) / 100), Math.max(1, cwid * 0.035), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    rr(ctx, x + cwid * 0.12, y + chgt * 0.12, cwid * 0.76, chgt * 0.18, chgt * 0.09);
    ctx.fill();
    add(scene, cork, c, true);
  }

  return { back, front, glow, cork, geo };
}

/** A shelf plank the bottles stand on: lit top face, darker front edge, ink outline, hard shadow. */
export function shelfTexture(scene: Phaser.Scene, w: number, h: number, color: number): string {
  const key = `dyn_shelf_${Math.round(w)}x${Math.round(h)}_${color}_${generation}`;
  if (scene.textures.exists(key)) return key;
  const pad = Math.ceil(h * 0.9) + 4;
  const [c, ctx] = canvas(w + pad * 2, h + pad * 2);
  const x = pad;
  const y = pad;
  const r = h * 0.35;
  const top = h * 0.38;
  rr(ctx, x, y + h * 0.55, w, h, r);
  ctx.fillStyle = 'rgba(6,7,26,0.38)';
  ctx.fill();
  const ink = Math.max(1.5, h * 0.12);
  rr(ctx, x - ink / 2, y - ink / 2, w + ink, h + ink, r + ink / 2);
  ctx.fillStyle = '#10132E';
  ctx.fill();
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = hexToCss(shade(color, -0.25));
  ctx.fill();
  rr(ctx, x, y, w, top, Math.min(r, top / 2));
  ctx.fillStyle = hexToCss(shade(color, 0.18));
  ctx.fill();
  // grain lines on the front edge
  ctx.strokeStyle = hexToCss(shade(color, -0.4), 0.5);
  ctx.lineWidth = Math.max(1, h * 0.06);
  for (let i = 1; i < 4; i++) {
    const gx = x + (w * i) / 4 + (i % 2 ? h : -h);
    ctx.beginPath();
    ctx.moveTo(gx, y + top + h * 0.15);
    ctx.quadraticCurveTo(gx + h * 1.5, y + top + h * 0.35, gx + h * 3, y + top + h * 0.2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  rr(ctx, x + r, y + top * 0.25, w - r * 2, Math.max(1, top * 0.22), top * 0.11);
  ctx.fill();
  return add(scene, key, c, true);
}

/** Frosted ice casing drawn over a frozen container. */
export function iceTexture(scene: Phaser.Scene, W: number, H: number): string {
  const key = `dyn_ice_${Math.round(W)}x${Math.round(H)}_${generation}`;
  if (scene.textures.exists(key)) return key;
  const geo = bottleGeometry(W, H);
  const pad = Math.ceil(W * 0.3);
  const cw = W + pad * 2;
  const ch = H + pad * 2;
  const ox = cw / 2;
  const oy = ch / 2;
  const [c, ctx] = canvas(cw, ch);
  ctx.save();
  bottlePath(ctx, geo, ox, oy, -W * 0.04);
  const g = ctx.createLinearGradient(ox - W / 2, oy - H / 2, ox + W / 2, oy + H / 2);
  g.addColorStop(0, 'rgba(225,246,255,0.92)');
  g.addColorStop(0.5, 'rgba(170,220,250,0.78)');
  g.addColorStop(1, 'rgba(205,238,255,0.9)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // facets and cracks
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1, W * 0.025);
  const lines = [
    [0.1, 0.15, 0.5, 0.32],
    [0.5, 0.32, 0.9, 0.22],
    [0.5, 0.32, 0.38, 0.62],
    [0.38, 0.62, 0.8, 0.74],
    [0.38, 0.62, 0.12, 0.85],
  ];
  for (const [x1, y1, x2, y2] of lines) {
    ctx.beginPath();
    ctx.moveTo(ox - W / 2 + x1 * W, oy - H / 2 + y1 * H);
    ctx.lineTo(ox - W / 2 + x2 * W, oy - H / 2 + y2 * H);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  rr(ctx, ox - W * 0.36, oy - H * 0.42, W * 0.16, H * 0.6, W * 0.08);
  ctx.fill();
  ctx.restore();
  bottlePath(ctx, geo, ox, oy, -W * 0.04);
  ctx.lineWidth = Math.max(1.5, W * 0.05);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();
  return add(scene, key, c, true);
}

/** The SORTOPIA wordmark: multicoloured liquid-glass letters with outline and gloss. */
export function logoTexture(scene: Phaser.Scene, height: number): string {
  const key = `dyn_logo_${Math.round(height)}_${generation}`;
  if (scene.textures.exists(key)) return key;
  const letters = 'SORTOPIA'.split('');
  const colors = [0x9b72f2, 0xff78b7, 0x59b8f5, 0xffd166, 0x62d6a5, 0xff9865, 0xff78b7, 0x59b8f5];
  const fontSize = Math.round(height);
  const measure = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  measure.font = `700 ${fontSize}px ${FONT.family}`;
  const spacing = -fontSize * 0.02;
  const widths = letters.map((l) => measure.measureText(l).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + spacing * (letters.length - 1);
  const pad = fontSize * 0.25;
  const [c, ctx] = canvas(totalW + pad * 2, fontSize * 1.35 + pad * 2);
  ctx.font = `700 ${fontSize}px ${FONT.family}`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const baseY = c.height / 2;
  let x = pad;
  letters.forEach((l, i) => {
    const w = widths[i];
    const dy = Math.sin(i * 1.1) * fontSize * 0.04;
    const col = colors[i];
    // deep shadow
    ctx.fillStyle = 'rgba(6,6,24,0.55)';
    ctx.fillText(l, x, baseY + dy + fontSize * 0.09);
    // outline
    ctx.lineWidth = fontSize * 0.16;
    ctx.strokeStyle = '#141838';
    ctx.strokeText(l, x, baseY + dy);
    ctx.lineWidth = fontSize * 0.07;
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeText(l, x, baseY + dy);
    // liquid fill: light top, saturated bottom
    const g = ctx.createLinearGradient(0, baseY - fontSize * 0.45, 0, baseY + fontSize * 0.45);
    g.addColorStop(0, hexToCss(shade(col, 0.55)));
    g.addColorStop(0.48, hexToCss(shade(col, 0.15)));
    g.addColorStop(0.52, hexToCss(col));
    g.addColorStop(1, hexToCss(shade(col, -0.2)));
    ctx.fillStyle = g;
    ctx.fillText(l, x, baseY + dy);
    // gloss highlight
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.38, baseY + dy - fontSize * 0.24, w * 0.24, fontSize * 0.09, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    x += w + spacing;
  });
  return add(scene, key, c, true);
}
