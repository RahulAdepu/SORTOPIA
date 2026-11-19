import Phaser from 'phaser';
import { layoutOf, type Layout } from '../config/layout';
import { COLORS, CSS, shade } from '../config/theme';
import { BOOSTS, BOTTLE_STYLES, PALETTES } from '../data/catalog';
import { LiquidContainer } from '../entities/Container';
import { evaluateAchievements, totalStars } from '../systems/Achievements';
import { GameManager } from '../systems/GameManager';
import { buyBottle, buyExtraBottle, buyHintPack, equipBottle, equipPalette, MAX_EXTRA_BOTTLES, ownsBottle, paletteUnlocked } from '../systems/ShopManager';
import { createBackground } from '../ui/Background';
import { Button, fadeIn, fitText, goTo, IconButton, Pill, text, toast } from '../ui/components';
import { panelTexture } from '../ui/TextureFactory';

type Tab = 'bottles' | 'liquids' | 'boosts';
const TABS: { id: Tab; label: string }[] = [
  { id: 'bottles', label: 'Bottles' },
  { id: 'liquids', label: 'Liquids' },
  { id: 'boosts', label: 'Boosts' },
];

/**
 * Where coins and stars go. Bottle styles cost coins, liquid palettes unlock
 * with stars (never spent), boosts are consumables. No real-money purchases.
 */
export class ShopScene extends Phaser.Scene {
  private tab: Tab = 'bottles';
  private bottles: LiquidContainer[] = [];
  private contentHeight = 0;
  private dragging = false;
  private lastY = 0;
  private velocity = 0;
  private coinPill!: Pill;

  constructor() {
    super('Shop');
  }

  create(data: { tab?: Tab; scroll?: number }): void {
    fadeIn(this);
    this.tab = data.tab ?? 'bottles';
    this.bottles = [];
    const L = layoutOf(this);
    GameManager.audio.playMusic('menu');
    const bg = createBackground(this, COLORS.yellow, { theme: 'candy', bubbles: 10 });
    bg.list.forEach((o) => (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0));

    const top = 150 * L.u;
    if (this.tab === 'bottles') this.contentHeight = this.buildBottles(L, top);
    else if (this.tab === 'liquids') this.contentHeight = this.buildPalettes(L, top);
    else this.contentHeight = this.buildBoosts(L, top);

    this.buildHeader(L);
    this.setupScroll(data.scroll ?? 0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (this.bottles = []));
  }

  private buildHeader(L: Layout): void {
    const save = GameManager.save;
    const hdr = this.add.image(L.cx, 66 * L.u, panelTexture(this, L.w, 132 * L.u, { top: 0x1b1f48, bottom: 0x171b3d, radius: 1, alpha: 0.96 })).setScrollFactor(0).setDepth(100);
    hdr.setDisplaySize(L.w + 4, 132 * L.u);
    new IconButton(this, L.cx - L.col / 2 + 24 * L.u, 38 * L.u, 46 * L.u, 'icon-back', () => goTo(this, 'MainMenu')).setScrollFactor(0).setDepth(101);
    text(this, L.cx, 38 * L.u, 'Shop', 22, { weight: 700, shadow: true }).setScrollFactor(0).setDepth(101);
    const pw = 84 * L.u;
    this.coinPill = new Pill(this, L.cx + L.col / 2 - pw / 2, 38 * L.u, pw, 32 * L.u, 'coin', String(save.coins));
    this.coinPill.setScrollFactor(0).setDepth(101);
    // Tabs
    const tw = Math.min(L.col, 360 * L.u);
    const th = 40 * L.u;
    const ty = 98 * L.u;
    this.add.image(L.cx, ty, panelTexture(this, tw, th, { top: 0x1a1e45, bottom: 0x232857, radius: th / 2, stroke: 0x434a92 })).setScrollFactor(0).setDepth(101);
    const segW = tw / TABS.length;
    TABS.forEach((t, i) => {
      const x = L.cx - tw / 2 + segW * (i + 0.5);
      const active = t.id === this.tab;
      if (active) this.add.image(x, ty, panelTexture(this, segW - 6 * L.u, th - 6 * L.u, { top: 0xffa6d0, bottom: 0xe2549a, radius: (th - 6 * L.u) / 2, gloss: true })).setScrollFactor(0).setDepth(102);
      const label = text(this, x, ty, t.label, 14, { weight: 700, color: active ? CSS.text : CSS.textDim }).setScrollFactor(0).setDepth(103);
      const hit = this.add.zone(x, ty, segW, th).setScrollFactor(0).setDepth(104).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (active) return;
        GameManager.audio.play('click');
        this.scene.restart({ tab: t.id });
      });
      void label;
    });
  }

  private card(L: Layout, x: number, y: number, w: number, h: number, highlight: number | null): void {
    this.add.image(x, y, panelTexture(this, w, h, { top: 0x2f3572, bottom: 0x1f2456, radius: 20 * L.u, stroke: highlight ?? 0x3a4080, strokeAlpha: highlight ? 0.85 : 0.5, shadow: true }));
  }

  private grid(L: Layout, top: number, count: number, ch: number): { x: number; y: number; w: number }[] {
    const total = Math.min(L.col, 420 * L.u);
    const gap = 12 * L.u;
    const cw = (total - gap) / 2;
    return Array.from({ length: count }, (_, i) => ({
      x: L.cx + (i % 2 === 0 ? -1 : 1) * (cw / 2 + gap / 2),
      y: top + Math.floor(i / 2) * (ch + gap) + ch / 2,
      w: cw,
    }));
  }

  private buildBottles(L: Layout, top: number): number {
    const save = GameManager.save;
    const ch = 236 * L.u;
    const cells = this.grid(L, top, BOTTLE_STYLES.length, ch);
    BOTTLE_STYLES.forEach((style, i) => {
      const { x, y, w } = cells[i];
      const owned = ownsBottle(save, style.id);
      const equipped = save.cosmetics.bottle === style.id;
      this.card(L, x, y, w, ch, equipped ? COLORS.green : null);
      const bw = 34 * L.u;
      const preview = new LiquidContainer(this, i, x, y - ch * 0.17, bw, bw * 3.5, 4, [i % 12, (i + 3) % 12, (i + 6) % 12], { style: style.id });
      this.bottles.push(preview);
      if (!GameManager.save.settings.reducedMotion) this.time.addEvent({ delay: 2400 + i * 500, loop: true, callback: () => preview.slosh(0.12, 1000) });
      const name = text(this, x, y + ch * 0.12, style.name, 15, { weight: 700 });
      fitText(name, w - 16 * L.u);
      const desc = text(this, x, y + ch * 0.21, style.description, 10.5, { weight: 500, color: CSS.textDim });
      fitText(desc, w - 16 * L.u);
      const by = y + ch / 2 - 30 * L.u;
      const bwid = w - 28 * L.u;
      if (equipped) {
        new Button(this, x, by, bwid, 38 * L.u, 'EQUIPPED', () => undefined, { variant: 'success', icon: 'icon-check', fontSize: 13, sound: false }).setEnabled(false).setAlpha(0.9);
      } else if (owned) {
        new Button(this, x, by, bwid, 38 * L.u, 'EQUIP', () => this.act(() => equipBottle(save, style.id), `${style.name} equipped`), { variant: 'secondary', fontSize: 14 });
      } else {
        const can = save.coins >= style.price;
        new Button(this, x, by, bwid, 38 * L.u, String(style.price), () => this.act(() => buyBottle(save, style.id), `${style.name} unlocked!`, style.price - save.coins), {
          variant: can ? 'warning' : 'ghost',
          icon: 'coin',
          iconSize: 22 * L.u,
          fontSize: 15,
        });
      }
    });
    return top + Math.ceil(BOTTLE_STYLES.length / 2) * (ch + 12 * L.u) + 30 * L.u;
  }

  private buildPalettes(L: Layout, top: number): number {
    const save = GameManager.save;
    const stars = totalStars(save);
    const ch = 196 * L.u;
    const cells = this.grid(L, top, PALETTES.length, ch);
    PALETTES.forEach((p, i) => {
      const { x, y, w } = cells[i];
      const unlocked = paletteUnlocked(save, p.id);
      const equipped = save.cosmetics.palette === p.id;
      this.card(L, x, y, w, ch, equipped ? COLORS.green : null);
      // 2 × 6 swatches of liquid drops
      const r = Math.min(10 * L.u, (w - 30 * L.u) / 14);
      const g = this.add.graphics();
      p.colors.forEach((col, k) => {
        const sx = x + ((k % 6) - 2.5) * r * 2.3;
        const sy = y - ch * 0.26 + Math.floor(k / 6) * r * 2.4;
        g.fillStyle(shade(col, -0.3), 1).fillCircle(sx, sy + r * 0.12, r);
        g.fillStyle(col, 1).fillCircle(sx, sy, r);
        g.fillStyle(0xffffff, 0.45).fillCircle(sx - r * 0.35, sy - r * 0.35, r * 0.28);
      });
      if (!unlocked) g.setAlpha(0.45);
      const name = text(this, x, y + ch * 0.05, p.name, 15, { weight: 700 });
      fitText(name, w - 16 * L.u);
      const desc = text(this, x, y + ch * 0.16, p.description, 10.5, { weight: 500, color: CSS.textDim });
      fitText(desc, w - 16 * L.u);
      const by = y + ch / 2 - 30 * L.u;
      const bwid = w - 28 * L.u;
      if (equipped) {
        new Button(this, x, by, bwid, 38 * L.u, 'EQUIPPED', () => undefined, { variant: 'success', icon: 'icon-check', fontSize: 13, sound: false }).setEnabled(false).setAlpha(0.9);
      } else if (unlocked) {
        new Button(this, x, by, bwid, 38 * L.u, 'EQUIP', () => this.act(() => equipPalette(save, p.id), `${p.name} equipped`), { variant: 'secondary', fontSize: 14 });
      } else {
        new Button(this, x, by, bwid, 38 * L.u, `${stars}/${p.stars}`, () => toast(this, `Earn ${p.stars - stars} more stars to unlock ${p.name}`, { icon: 'icon-star' }), {
          variant: 'ghost',
          icon: 'icon-star',
          iconSize: 20 * L.u,
          fontSize: 14,
        });
      }
    });
    const note = top + Math.ceil(PALETTES.length / 2) * (ch + 12 * L.u) + 10 * L.u;
    text(this, L.cx, note, 'Palettes unlock with stars. Stars are never spent.', 11, { weight: 500, color: CSS.textMuted });
    return note + 40 * L.u;
  }

  private buildBoosts(L: Layout, top: number): number {
    const save = GameManager.save;
    const ch = 210 * L.u;
    const cells = this.grid(L, top, 2, ch);
    const boosts = [
      {
        icon: 'icon-bottle-plus',
        name: BOOSTS.extraBottle.name,
        desc: 'Adds an empty bottle mid-puzzle (max 2 stars).',
        own: `Owned: ${save.items.extraBottles}/${MAX_EXTRA_BOTTLES}`,
        price: BOOSTS.extraBottle.price,
        buy: () => this.act(() => buyExtraBottle(save), 'Extra Bottle added to your boosts', BOOSTS.extraBottle.price - save.coins),
      },
      {
        icon: 'icon-hint',
        name: BOOSTS.hintPack.name,
        desc: `${BOOSTS.hintPack.amount} hints at a discount.`,
        own: `Hints: ${save.hints}`,
        price: BOOSTS.hintPack.price,
        buy: () => this.act(() => buyHintPack(save), `+${BOOSTS.hintPack.amount} hints`, BOOSTS.hintPack.price - save.coins),
      },
    ];
    boosts.forEach((b, i) => {
      const { x, y, w } = cells[i];
      this.card(L, x, y, w, ch, null);
      this.add.image(x, y - ch * 0.26, panelTexture(this, 64 * L.u, 64 * L.u, { top: 0xffe08f, bottom: 0xf5a930, radius: 20 * L.u, gloss: true, shadow: true }));
      this.add.image(x, y - ch * 0.27, b.icon).setScale((36 * L.u) / 128).setTint(0x5a3300);
      const name = text(this, x, y - ch * 0.04, b.name, 15, { weight: 700 });
      fitText(name, w - 16 * L.u);
      const desc = text(this, x, y + ch * 0.07, b.desc, 10.5, { weight: 500, color: CSS.textDim, wrap: w - 20 * L.u });
      void desc;
      text(this, x, y + ch * 0.2, b.own, 11, { weight: 700, color: CSS.gold });
      const can = save.coins >= b.price;
      new Button(this, x, y + ch / 2 - 30 * L.u, w - 28 * L.u, 38 * L.u, String(b.price), b.buy, { variant: can ? 'warning' : 'ghost', icon: 'coin', iconSize: 22 * L.u, fontSize: 15 });
    });
    const note = top + ch + 30 * L.u;
    text(this, L.cx, note, 'Coins are earned by playing: levels, perfect solves,\ndaily challenges, achievements and level-ups.', 11, { weight: 500, color: CSS.textMuted, wrap: L.col });
    return note + 50 * L.u;
  }

  /** Run a shop action, then persist and refresh in place. */
  private act(fn: () => { ok: boolean; reason?: string }, success: string, shortBy = 0): void {
    const r = fn();
    if (!r.ok) {
      GameManager.audio.play('invalid');
      const msg = r.reason === 'coins' ? `You need ${Math.max(1, shortBy)} more coins` : r.reason === 'max' ? 'You are carrying the maximum' : 'Not available yet';
      toast(this, msg, { icon: 'coin' });
      return;
    }
    const save = GameManager.save;
    evaluateAchievements(save);
    GameManager.applySettings();
    void GameManager.commitNow();
    GameManager.audio.play('coin');
    GameManager.haptic(15);
    this.coinPill.setValue(String(save.coins));
    toast(this, success, { icon: 'icon-check', color: 0x2f6e58 });
    const scroll = this.cameras.main.scrollY;
    this.time.delayedCall(450, () => this.scene.restart({ tab: this.tab, scroll }));
  }

  private setupScroll(initial: number): void {
    const cam = this.cameras.main;
    const L = layoutOf(this);
    cam.setBounds(0, 0, L.w, Math.max(L.h, this.contentHeight));
    cam.scrollY = initial;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.velocity = 0;
      this.lastY = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return;
      const dy = p.y - this.lastY;
      cam.scrollY -= dy;
      this.velocity = -dy;
      this.lastY = p.y;
    });
    this.input.on('pointerup', () => (this.dragging = false));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => (cam.scrollY += dy));
    this.input.keyboard?.on('keydown-ESC', () => goTo(this, 'MainMenu'));
  }

  update(): void {
    for (const b of this.bottles) b.tick();
    const cam = this.cameras.main;
    if (!this.dragging && Math.abs(this.velocity) > 0.1) {
      cam.scrollY += this.velocity;
      this.velocity *= 0.92;
    }
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, Math.max(0, this.contentHeight - cam.height));
  }
}
