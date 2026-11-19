import type Phaser from 'phaser';
import { addDynamicCanvas, currentGeneration } from './TextureFactory';

export type ModeArtKind = 'daily' | 'time' | 'moves' | 'zen';

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const INK = '#10132E';

/**
 * Small illustration for a mode tile. `label` is real data drawn into the art
 * (today's date, the move count) so the tile shows content, not decoration.
 */
export function modeArtTexture(scene: Phaser.Scene, kind: ModeArtKind, size: number, label: string): string {
  const key = `dyn_modeart_${kind}_${Math.round(size)}_${label}_${currentGeneration()}`;
  if (scene.textures.exists(key)) return key;
  const s = Math.round(size);
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const k = s / 100;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'daily': {
      // Tear-off calendar page.
      ctx.save();
      ctx.translate(50 * k, 52 * k);
      ctx.rotate(-0.08);
      rr(ctx, -34 * k, -34 * k, 68 * k, 72 * k, 10 * k);
      ctx.fillStyle = INK;
      ctx.fill();
      rr(ctx, -31 * k, -31 * k, 62 * k, 66 * k, 8 * k);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.save();
      rr(ctx, -31 * k, -31 * k, 62 * k, 66 * k, 8 * k);
      ctx.clip();
      ctx.fillStyle = '#E8435A';
      ctx.fillRect(-31 * k, -31 * k, 62 * k, 18 * k);
      ctx.restore();
      ctx.fillStyle = INK;
      for (const rx of [-16, 16]) {
        rr(ctx, (rx - 3) * k, -39 * k, 6 * k, 14 * k, 3 * k);
        ctx.fill();
      }
      ctx.font = `700 ${34 * k}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#2A2F63';
      ctx.fillText(label, 0, 12 * k);
      ctx.restore();
      break;
    }
    case 'time': {
      // Hourglass with coloured sand.
      ctx.save();
      ctx.translate(50 * k, 50 * k);
      ctx.fillStyle = INK;
      rr(ctx, -30 * k, -42 * k, 60 * k, 10 * k, 5 * k);
      ctx.fill();
      rr(ctx, -30 * k, 32 * k, 60 * k, 10 * k, 5 * k);
      ctx.fill();
      const glass = () => {
        ctx.beginPath();
        ctx.moveTo(-22 * k, -32 * k);
        ctx.lineTo(22 * k, -32 * k);
        ctx.quadraticCurveTo(22 * k, -6 * k, 4 * k, 0);
        ctx.quadraticCurveTo(22 * k, 6 * k, 22 * k, 32 * k);
        ctx.lineTo(-22 * k, 32 * k);
        ctx.quadraticCurveTo(-22 * k, 6 * k, -4 * k, 0);
        ctx.quadraticCurveTo(-22 * k, -6 * k, -22 * k, -32 * k);
        ctx.closePath();
      };
      glass();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      ctx.save();
      glass();
      ctx.clip();
      ctx.fillStyle = '#FFD166';
      ctx.fillRect(-22 * k, -32 * k, 44 * k, 14 * k);
      ctx.beginPath();
      ctx.moveTo(-22 * k, 32 * k);
      ctx.lineTo(0, 14 * k);
      ctx.lineTo(22 * k, 32 * k);
      ctx.fill();
      ctx.fillRect(-1.5 * k, -4 * k, 3 * k, 20 * k);
      ctx.restore();
      glass();
      ctx.lineWidth = 4 * k;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'moves': {
      // A pour counter: three mini bottles and the move budget.
      ctx.save();
      ctx.translate(50 * k, 52 * k);
      rr(ctx, -36 * k, -30 * k, 72 * k, 62 * k, 14 * k);
      ctx.fillStyle = INK;
      ctx.fill();
      rr(ctx, -33 * k, -27 * k, 66 * k, 56 * k, 12 * k);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.font = `700 ${30 * k}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#2A2F63';
      ctx.fillText(label, 0, -2 * k);
      ctx.fillStyle = '#FF9865';
      rr(ctx, -20 * k, 15 * k, 40 * k, 7 * k, 3.5 * k);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'zen': {
      // A leaf floating on rippling water.
      ctx.save();
      ctx.translate(50 * k, 54 * k);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 3.5 * k;
      for (const r of [16, 27, 38]) {
        ctx.beginPath();
        ctx.ellipse(0, 18 * k, r * k, r * 0.32 * k, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(-0.5);
      ctx.beginPath();
      ctx.moveTo(-26 * k, 8 * k);
      ctx.bezierCurveTo(-24 * k, -18 * k, 6 * k, -30 * k, 28 * k, -24 * k);
      ctx.bezierCurveTo(26 * k, 2 * k, 2 * k, 18 * k, -26 * k, 8 * k);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.lineWidth = 4 * k;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-22 * k, 6 * k);
      ctx.bezierCurveTo(-20 * k, -14 * k, 6 * k, -24 * k, 24 * k, -20 * k);
      ctx.bezierCurveTo(22 * k, 0, 2 * k, 14 * k, -22 * k, 6 * k);
      ctx.fillStyle = '#B5E14A';
      ctx.fill();
      ctx.strokeStyle = '#4E7A1E';
      ctx.lineWidth = 2.5 * k;
      ctx.beginPath();
      ctx.moveTo(-18 * k, 3 * k);
      ctx.quadraticCurveTo(0, -8 * k, 20 * k, -18 * k);
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
  return addDynamicCanvas(scene, key, c);
}
