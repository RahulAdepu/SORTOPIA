import type Phaser from 'phaser';

/**
 * One distinct shape per liquid colour, drawn on each liquid unit when the
 * "Colour symbols" accessibility option is on, so the game is fully playable
 * without relying on hue.
 */
export const SYMBOL_NAMES = ['circle', 'triangle', 'square', 'diamond', 'star', 'plus', 'ring', 'hexagon', 'cross', 'bar', 'heart', 'drop'] as const;

function poly(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, sides: number, rot: number): void {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  g.fillPoints(pts, true);
  g.strokePoints(pts, true);
}

export function drawSymbol(g: Phaser.GameObjects.Graphics, color: number, x: number, y: number, size: number): void {
  const r = size / 2;
  g.fillStyle(0xffffff, 0.92);
  g.lineStyle(Math.max(1, size * 0.09), 0x1a1d40, 0.55);
  switch (SYMBOL_NAMES[color % SYMBOL_NAMES.length]) {
    case 'circle':
      g.fillCircle(x, y, r * 0.78);
      g.strokeCircle(x, y, r * 0.78);
      break;
    case 'triangle':
      poly(g, x, y + r * 0.12, r * 0.95, 3, -Math.PI / 2);
      break;
    case 'square':
      g.fillRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
      g.strokeRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
      break;
    case 'diamond':
      poly(g, x, y, r * 0.95, 4, 0);
      break;
    case 'star': {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r : r * 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
      }
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
      break;
    }
    case 'plus':
      g.fillRect(x - r * 0.25, y - r * 0.85, r * 0.5, r * 1.7);
      g.fillRect(x - r * 0.85, y - r * 0.25, r * 1.7, r * 0.5);
      break;
    case 'ring':
      g.lineStyle(Math.max(2, r * 0.38), 0xffffff, 0.92);
      g.strokeCircle(x, y, r * 0.6);
      break;
    case 'hexagon':
      poly(g, x, y, r * 0.85, 6, 0);
      break;
    case 'cross': {
      g.lineStyle(Math.max(2, r * 0.42), 0xffffff, 0.92);
      g.lineBetween(x - r * 0.6, y - r * 0.6, x + r * 0.6, y + r * 0.6);
      g.lineBetween(x + r * 0.6, y - r * 0.6, x - r * 0.6, y + r * 0.6);
      break;
    }
    case 'bar':
      g.fillRect(x - r * 0.85, y - r * 0.22, r * 1.7, r * 0.44);
      g.fillRect(x - r * 0.85, y - r * 0.75, r * 1.7, r * 0.25);
      break;
    case 'heart': {
      g.fillCircle(x - r * 0.38, y - r * 0.2, r * 0.42);
      g.fillCircle(x + r * 0.38, y - r * 0.2, r * 0.42);
      g.fillTriangle(x - r * 0.78, y - r * 0.05, x + r * 0.78, y - r * 0.05, x, y + r * 0.8);
      break;
    }
    case 'drop': {
      g.fillCircle(x, y + r * 0.2, r * 0.58);
      g.fillTriangle(x - r * 0.52, y + r * 0.02, x + r * 0.52, y + r * 0.02, x, y - r * 0.9);
      break;
    }
  }
}
