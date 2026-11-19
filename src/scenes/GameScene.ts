import Phaser from 'phaser';
import { layoutOf, type Layout } from '../config/layout';
import { COLORS, CSS, LIQUIDS } from '../config/theme';
import { LiquidContainer } from '../entities/Container';
import { pourAngleFor } from '../entities/Liquid';
import { GameManager } from '../systems/GameManager';
import { findHint } from '../systems/HintSystem';
import { HiddenLayers } from '../systems/HiddenLayers';
import { consumeExtraBottle } from '../systems/ShopManager';
import { BOOSTS } from '../data/catalog';
import { MECHANIC_INTROS } from '../data/levels/levelPlan';
import { PuzzleEngine } from '../systems/PuzzleEngine';
import { applyWin, canAffordHint, recordInProgress, spendHint } from '../systems/ProgressManager';
import { HINT_PRICE } from '../systems/RewardManager';
import type { LossReason, PlayConfig, PlayStats } from '../types/game';
import type { Move } from '../types/puzzle';
import { createBackground, themeForLevel, type BgTheme } from '../ui/Background';
import { Button, dimmer, fadeIn, fitText, IconButton, modalPanel, text, toast } from '../ui/components';
import { panelTexture, shelfTexture } from '../ui/TextureFactory';

/** Game state that must survive scene rebuilds (e.g. viewport resize). */
interface Session {
  config: PlayConfig;
  engine: PuzzleEngine;
  elapsed: number;
  hintsUsed: number;
  undosUsed: number;
  finished: boolean;
  won: boolean;
  lost: LossReason | null;
  tutorialStep: number;
  /** "?" mystery-layer tracking. */
  hidden: HiddenLayers;
  /** Extra Bottle boosts used in this puzzle. */
  extra: number;
}

let session: Session | null = null;

function newSession(config: PlayConfig): Session {
  const engine = new PuzzleEngine(config.puzzle);
  const hidden = new HiddenLayers(config.puzzle.tubes, !!config.hidden);
  let hintsUsed = 0;
  let undosUsed = 0;
  let extra = 0;
  if (config.resume) {
    for (let i = 0; i < (config.resume.extra ?? 0); i++) engine.addContainer();
    extra = config.resume.extra ?? 0;
    // Replay step by step so every "?" that reached the top is revealed exactly as it was.
    let ok = true;
    for (const [f, t] of config.resume.history) {
      if (!engine.pour(f, t)) {
        ok = false;
        break;
      }
      hidden.sync(engine.tubes);
    }
    if (ok) {
      hintsUsed = config.resume.hintsUsed;
      undosUsed = config.resume.undosUsed;
    } else {
      engine.restart();
    }
  }
  hidden.sync(engine.tubes);
  return { config, engine, elapsed: 0, hintsUsed, undosUsed, finished: false, won: false, lost: null, tutorialStep: 0, hidden, extra };
}

/** In-progress boards are saved after a quiet period (and always on platform pause). */
const IN_PROGRESS_SAVE_DELAY = 2500;
/** Shelf material per scene: driftwood, frosting, wood, stone, metal. */
const SHELF_COLORS: Record<BgTheme, number> = {
  menu: 0x7a5a8c,
  lagoon: 0x9a7a5a,
  candy: 0xd86aa6,
  grove: 0x8a5a36,
  peaks: 0x7a5a58,
  nebula: 0x6a6aa8,
};

const UNDO_UNLOCK = 11;
const HINT_UNLOCK = 13;

export class GameScene extends Phaser.Scene {
  private s!: Session;
  private L!: Layout;
  private bottles: LiquidContainer[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private animTweens = new Set<Phaser.Tweens.Tween>();
  private shelves: Phaser.GameObjects.Image[] = [];
  private theme: BgTheme = 'menu';
  private selected: number | null = null;
  private epoch = 0;
  private stream!: Phaser.GameObjects.Graphics;
  private splash!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private movesText!: Phaser.GameObjects.Text;
  private timerText: Phaser.GameObjects.Text | null = null;
  private timerPill: Phaser.GameObjects.Container | null = null;
  private progressGfx!: Phaser.GameObjects.Graphics;
  private progressText!: Phaser.GameObjects.Text;
  private undoBtn!: IconButton;
  private hintBtn!: IconButton;
  private restartBtn!: IconButton;
  private hintMarkers: Phaser.GameObjects.GameObject[] = [];
  private hintPair: { from: number; to: number } | null = null;
  private tutorialObjs: Phaser.GameObjects.GameObject[] = [];
  private lastTimerSecond = -1;
  private boardTop = 0;
  private boardBottom = 0;
  private boardCx = 0;
  private boardW = 0;
  /** Y of the message strip between the HUD and the board (toasts never cover bottles). */
  private msgY = 0;
  private extraBtn!: IconButton;
  private unsubPause: (() => void) | null = null;

  constructor() {
    super('Game');
  }

  create(data: { config: PlayConfig }): void {
    fadeIn(this);
    if (!session || session.config !== data.config) session = newSession(data.config);
    this.s = session;
    this.L = layoutOf(this);
    this.bottles = [];
    this.zones = [];
    this.selected = null;
    this.hintMarkers = [];
    this.hintPair = null;
    this.animTweens = new Set();
    this.tutorialObjs = [];
    this.lastTimerSecond = -1;
    this.epoch++;

    const cfg = this.s.config;
    GameManager.audio.playMusic(cfg.mode === 'zen' ? 'zen' : 'game', (cfg.level ?? cfg.stage ?? 0) % 2);
    const accent = cfg.mode === 'time' ? COLORS.blue : cfg.mode === 'moves' ? COLORS.orange : cfg.mode === 'zen' ? COLORS.green : cfg.mode === 'daily' ? COLORS.yellow : COLORS.purple;
    const theme: BgTheme =
      cfg.mode === 'classic' ? themeForLevel(cfg.level ?? 1) : cfg.mode === 'time' ? 'lagoon' : cfg.mode === 'moves' ? 'peaks' : cfg.mode === 'zen' ? 'grove' : 'candy';
    this.theme = theme;
    this.shelves = [];
    createBackground(this, accent, { bubbles: cfg.mode === 'zen' ? 18 : 12, theme });

    this.buildHud();
    this.buildBoard(true);
    this.buildEffects();
    this.refreshHud();
    this.bindKeys();
    this.introduceFeatures();
    this.updateTutorial();

    this.unsubPause = GameManager.onPauseChange((paused) => {
      // Platform pause: show our pause menu so play doesn't resume unexpectedly.
      if (paused && !this.s.finished && this.scene.isActive()) this.openPause();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubPause?.();
      this.epoch++;
      this.bottles = [];
    });

    if (this.s.finished) this.input.enabled = false;
    // Rebuilt underneath an overlay (resize) → stay paused under it.
    if (this.scene.isActive('Pause') || this.scene.isPaused('Pause')) this.scene.pause();
  }

  // ------------------------------------------------------------------ HUD

  private buildHud(): void {
    const L = this.L;
    const cfg = this.s.config;
    const left = L.cx - L.col / 2;
    const right = L.cx + L.col / 2;
    const y = 38 * L.u;
    new IconButton(this, left + 24 * L.u, y, 46 * L.u, 'icon-pause', () => this.openPause()).setDepth(50);

    const title = text(this, L.cx, y - 8 * L.u, cfg.title, 22, { weight: 700, shadow: true }).setDepth(50);
    fitText(title, L.col * 0.5);
    const subtitle = text(this, L.cx, y + 15 * L.u, cfg.subtitle.toUpperCase(), 11, { weight: 600, color: CSS.textDim }).setDepth(50);
    subtitle.setLetterSpacing(1.2 * L.u);
    fitText(subtitle, L.col * 0.5);

    const mw = 82 * L.u;
    const mh = 48 * L.u;
    const mx = right - mw / 2;
    this.add.image(mx, y, panelTexture(this, mw, mh, { top: 0x2c3270, bottom: 0x1e2352, radius: 16 * L.u, stroke: cfg.moveLimit ? COLORS.orange : 0x5a62b8, strokeAlpha: 0.7 })).setDepth(50);
    text(this, mx, y - 11 * L.u, cfg.moveLimit ? 'MOVES LEFT' : 'MOVES', 10, { weight: 600, color: CSS.textDim }).setDepth(51);
    this.movesText = text(this, mx, y + 8 * L.u, '0', 19, { weight: 700 }).setDepth(51);

    // Row 2: progress + timer / target
    const y2 = 86 * L.u;
    const pw = cfg.timeLimit ? L.col * 0.56 : L.col * 0.7;
    const px = cfg.timeLimit ? left + pw / 2 : L.cx;
    this.add.image(px, y2, panelTexture(this, pw, 26 * L.u, { top: 0x1a1e45, bottom: 0x232857, radius: 13 * L.u, stroke: 0x434a92, strokeAlpha: 0.8 })).setDepth(50);
    this.progressGfx = this.add.graphics().setDepth(51);
    this.progressGfx.setData('rect', { x: px - pw / 2 + 4 * L.u, y: y2 - 9 * L.u, w: pw - 8 * L.u, h: 18 * L.u });
    this.progressText = text(this, px, y2, '', 12.5, { weight: 700, shadow: true }).setDepth(52);

    if (cfg.timeLimit) {
      const tw = L.col * 0.4;
      const tx = right - tw / 2;
      this.timerPill = this.add.container(tx, y2).setDepth(50);
      const bg = this.add.image(0, 0, panelTexture(this, tw, 34 * L.u, { top: 0x3d7fc0, bottom: 0x24508a, radius: 17 * L.u, stroke: 0xffffff, strokeAlpha: 0.35, gloss: true }));
      const ic = this.add.image(-tw / 2 + 18 * L.u, 0, 'icon-timer').setScale((20 * L.u) / 128);
      this.timerText = text(this, 8 * L.u, 0, '0:00', 17, { weight: 700 });
      this.timerPill.add([bg, ic, this.timerText]);
    }

    // Controls: a bottom row in portrait, a right-hand rail in wide landscape
    // (frees the full height for bigger bottles).
    const rail = !L.portrait && L.w > L.h * 1.25;
    const s = 58 * L.u;
    this.msgY = 120 * L.u;
    this.boardTop = 144 * L.u;
    if (rail) {
      const rx = L.w - 56 * L.u;
      const gap = Math.min(96 * L.u, (L.h - 140 * L.u) / 4);
      const y0 = L.h / 2 - gap * 1.5 + 20 * L.u;
      this.restartBtn = new IconButton(this, rx, y0, s, 'icon-restart', () => this.doRestart(), { caption: 'Restart' }).setDepth(50);
      this.undoBtn = new IconButton(this, rx, y0 + gap, s, 'icon-undo', () => this.doUndo(), { caption: 'Undo' }).setDepth(50);
      this.extraBtn = new IconButton(this, rx, y0 + gap * 2, s, 'icon-bottle-plus', () => this.doExtraBottle(), { caption: 'Bottle' }).setDepth(50);
      this.hintBtn = new IconButton(this, rx, y0 + gap * 3, s, 'icon-hint', () => this.doHint(), { caption: 'Hint', variant: 'warning' }).setDepth(50);
      this.boardBottom = L.h - 22 * L.u;
      this.boardW = L.w - 140 * L.u;
      this.boardCx = this.boardW / 2 + 10 * L.u;
    } else {
      const by = L.h - Math.max(58 * L.u, Math.min(78 * L.u, L.h * 0.09));
      const step = Math.min((L.col - s) / 3, 92 * L.u);
      const x0 = L.cx - step * 1.5;
      this.restartBtn = new IconButton(this, x0, by, s, 'icon-restart', () => this.doRestart(), { caption: 'Restart' }).setDepth(50);
      this.undoBtn = new IconButton(this, x0 + step, by, s, 'icon-undo', () => this.doUndo(), { caption: 'Undo' }).setDepth(50);
      this.extraBtn = new IconButton(this, x0 + step * 2, by, s, 'icon-bottle-plus', () => this.doExtraBottle(), { caption: 'Bottle' }).setDepth(50);
      this.hintBtn = new IconButton(this, x0 + step * 3, by, s, 'icon-hint', () => this.doHint(), { caption: 'Hint', variant: 'warning' }).setDepth(50);
      this.boardBottom = by - s * 0.5 - 24 * L.u;
      this.boardW = L.w;
      this.boardCx = L.cx;
    }
  }

  private get undoUnlocked(): boolean {
    return this.s.config.mode !== 'classic' || GameManager.save.unlocked >= UNDO_UNLOCK;
  }

  private get hintUnlocked(): boolean {
    return this.s.config.mode !== 'classic' || GameManager.save.unlocked >= HINT_UNLOCK;
  }

  private refreshHud(): void {
    const L = this.L;
    const cfg = this.s.config;
    const e = this.s.engine;
    if (cfg.moveLimit) {
      const left = Math.max(0, cfg.moveLimit - e.moves);
      this.movesText.setText(String(left));
      this.movesText.setColor(left <= 3 ? CSS.danger : CSS.text);
    } else {
      this.movesText.setText(String(e.moves));
    }
    // progress
    const r = this.progressGfx.getData('rect') as { x: number; y: number; w: number; h: number };
    const done = e.completedCount();
    const frac = done / cfg.colors;
    this.progressGfx.clear();
    if (frac > 0) {
      this.progressGfx.fillStyle(COLORS.green, 1);
      this.progressGfx.fillRoundedRect(r.x, r.y, Math.max(r.h, r.w * frac), r.h, r.h / 2);
      this.progressGfx.fillStyle(0xffffff, 0.25);
      this.progressGfx.fillRoundedRect(r.x + 3 * L.u, r.y + 2 * L.u, Math.max(r.h - 6 * L.u, r.w * frac - 6 * L.u), r.h * 0.3, r.h * 0.15);
    }
    this.progressText.setText(cfg.mode === 'classic' || cfg.mode === 'daily' ? `${done}/${cfg.colors} sorted  ·  3★ in ${cfg.par}` : `${done}/${cfg.colors} sorted`);
    fitText(this.progressText, r.w - 8 * L.u);

    this.undoBtn.setLocked(!this.undoUnlocked);
    // Extra Bottle: unlocks with Undo; shows stock, or its coin price when out.
    this.extraBtn.setLocked(!this.undoUnlocked);
    const stock = GameManager.save.items.extraBottles;
    if (!this.undoUnlocked || this.s.extra >= 1) this.extraBtn.setBadge(null);
    else if (stock > 0) this.extraBtn.setBadge(String(stock), COLORS.green);
    else this.extraBtn.setBadge(String(BOOSTS.extraBottle.price), 0x7a4fd0, 'coin');
    this.extraBtn.icon.setAlpha(this.s.extra >= 1 ? 0.35 : this.undoUnlocked ? 1 : 0.35);
    this.hintBtn.setLocked(!this.hintUnlocked);
    const save = GameManager.save;
    if (!this.hintUnlocked) this.hintBtn.setBadge(null);
    else if (save.hints > 0) this.hintBtn.setBadge(String(save.hints), COLORS.pink);
    else this.hintBtn.setBadge(String(HINT_PRICE), 0x7a4fd0, 'coin');
  }

  // ---------------------------------------------------------------- board

  private buildBoard(intro: boolean): void {
    const L = this.L;
    const e = this.s.engine;
    const n = e.tubes.length;
    const cap = e.capacity;
    const aspect = 2.9 + cap * 0.15;
    const availW = Math.min(this.boardW - 20 * L.u, 980 * L.u);
    const availH = this.boardBottom - this.boardTop;
    // Size for each row count; each extra row costs 15% in the score, so we only
    // stack rows when it buys clearly bigger (more tappable) containers.
    const sizes: { rows: number; W: number }[] = [];
    for (let rows = 1; rows <= 4; rows++) {
      const perRow = Math.ceil(n / rows);
      const cellW = availW / perRow;
      const cellH = availH / rows;
      sizes.push({ rows, W: Math.min(cellW * 0.66, cellH / (aspect * 1.32), (L.portrait ? 70 : 92) * L.u) });
    }
    const score = (s: { rows: number; W: number }) => s.W * Math.pow(0.85, s.rows - 1);
    const best = sizes.reduce((a, b) => (score(b) > score(a) ? b : a));
    const W = best.W;
    const H = W * aspect;
    const rows = best.rows;
    const base = Math.floor(n / rows);
    const extra = n % rows;
    const rowCounts = Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
    const spacingX = Math.min(availW / Math.max(...rowCounts), W * 1.85);
    const rowSpacing = Math.min(availH / rows, H * 1.3);
    const totalH = rowSpacing * rows;
    const startY = this.boardTop + (availH - totalH) / 2 + rowSpacing / 2 + H * 0.06;

    let idx = 0;
    const shelfColor = SHELF_COLORS[this.theme] ?? SHELF_COLORS.menu;
    for (let r = 0; r < rows; r++) {
      const count = rowCounts[r];
      // The row's shelf: bottles stand on it rather than floating in space.
      const shelfW = (count - 1) * spacingX + W * 2;
      const shelfH = Math.max(8, W * 0.2);
      const shelf = this.add.image(this.boardCx, startY + r * rowSpacing + H / 2 + shelfH * 0.42, shelfTexture(this, shelfW, shelfH, shelfColor)).setDepth(2);
      this.shelves.push(shelf);
      for (let k = 0; k < count; k++) {
        const x = this.boardCx + (k - (count - 1) / 2) * spacingX;
        const y = startY + r * rowSpacing;
        const i = idx++;
        const b = new LiquidContainer(this, i, x, y, W, H, cap, e.tubes[i], {
          hiddenMask: this.s.hidden.mask(i, e.tubes[i].length),
          frozenLabel: e.isFrozen(i) ? this.frozenLabel(i) : undefined,
        });
        this.bottles.push(b);
        const zone = this.add.zone(x, y - H * 0.06, spacingX * 0.98, Math.min(rowSpacing, H * 1.3)).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.onTap(i));
        this.zones.push(zone);
        if (intro && !GameManager.save.settings.reducedMotion) {
          b.y = y + 40 * L.u;
          b.alpha = 0;
          this.tweens.add({ targets: b, y, alpha: 1, duration: 420, delay: 40 * i, ease: 'Back.easeOut' });
        }
      }
    }
  }

  private rebuildBoard(): void {
    this.epoch++;
    // Stop only board animations; the HUD and background motion keep running.
    [...this.animTweens].forEach((t) => t.stop());
    this.animTweens.clear();
    this.bottles.forEach((b) => {
      this.tweens.killTweensOf(b);
      b.destroy();
    });
    this.shelves.forEach((sh) => sh.destroy());
    this.shelves = [];
    this.zones.forEach((z) => z.destroy());
    this.bottles = [];
    this.zones = [];
    this.selected = null;
    this.stream?.clear();
    this.splash?.stop();
    this.buildBoard(true);
  }

  private buildEffects(): void {
    const u = this.L.u;
    this.stream = this.add.graphics().setDepth(25);
    this.splash = this.add.particles(0, 0, 'dot', {
      speed: { min: 40 * u, max: 130 * u },
      angle: { min: 215, max: 325 },
      gravityY: 520 * u,
      lifespan: 420,
      scale: { start: 0.32 * u, end: 0 },
      frequency: 28,
      quantity: 2,
      emitting: false,
    });
    this.splash.setDepth(26);
    this.sparkles = this.add.particles(0, 0, 'spark', {
      speed: { min: 60 * u, max: 220 * u },
      lifespan: { min: 500, max: 900 },
      scale: { start: 0.55 * u, end: 0 },
      rotate: { min: 0, max: 360 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.sparkles.setDepth(40);
    this.confetti = this.add.particles(0, 0, 'confetti', {
      speed: { min: 260 * u, max: 620 * u },
      angle: { min: 235, max: 305 },
      gravityY: 700 * u,
      lifespan: { min: 1600, max: 2600 },
      scale: { start: 0.9 * u, end: 0.5 * u },
      rotate: { start: 0, end: 720 },
      tint: [COLORS.purple, COLORS.pink, COLORS.blue, COLORS.yellow, COLORS.green, COLORS.orange],
      emitting: false,
    });
    this.confetti.setDepth(45);
  }

  // ---------------------------------------------------------------- input

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-ESC', () => this.openPause());
    kb.on('keydown-U', () => this.doUndo());
    kb.on('keydown-Z', (ev: KeyboardEvent) => (ev.ctrlKey || ev.metaKey) && this.doUndo());
    kb.on('keydown-H', () => this.doHint());
    kb.on('keydown-R', () => this.doRestart());
    kb.on('keydown', (ev: KeyboardEvent) => {
      const d = Number.parseInt(ev.key, 10);
      if (!Number.isNaN(d)) {
        const i = d === 0 ? 9 : d - 1;
        if (i < this.bottles.length) this.onTap(i);
      }
    });
  }

  private onTap(i: number): void {
    if (this.s.finished || !this.scene.isActive()) return;
    GameManager.audio.unlock();
    this.clearHint();
    const e = this.s.engine;
    const b = this.bottles[i];
    if (!b) return;
    if (e.isFrozen(i)) {
      b.shake();
      GameManager.audio.play('invalid');
      toast(this, 'Frozen! Sort one colour to thaw this bottle.', { y: this.msgY, icon: 'icon-snow' });
      this.deselect();
      return;
    }
    if (this.selected === null) {
      // A bottle still flying home can be selected; it lifts when it lands.
      if (e.tubes[i].length === 0 || e.isTubeComplete(i)) {
        b.shake();
        GameManager.audio.play('invalid');
        return;
      }
      this.select(i);
      return;
    }
    if (this.selected === i) {
      this.deselect();
      GameManager.audio.play('deselect');
      return;
    }
    const from = this.selected;
    const check = e.canPour(from, i);
    if (!check.ok) {
      b.shake();
      GameManager.audio.play('invalid');
      GameManager.haptic([10, 40, 10]);
      this.deselect();
      if (check.reason === 'color-mismatch' && this.s.tutorialStep < 3 && this.s.config.level === 1) {
        toast(this, 'Pour only onto the same colour or into an empty bottle', { y: this.msgY });
      }
      return;
    }
    this.pour(from, i);
  }

  private select(i: number): void {
    this.selected = i;
    this.bottles[i].setSelected(true);
    GameManager.audio.play('select', { pitch: (this.s.engine.tubes[i][this.s.engine.tubes[i].length - 1] ?? 0) % 5 });
    GameManager.haptic(10);
    this.updateTutorial();
  }

  private deselect(): void {
    if (this.selected === null) return;
    const b = this.bottles[this.selected];
    this.selected = null;
    b.setSelected(false);
    this.updateTutorial();
  }

  // ---------------------------------------------------------------- moves

  /** Serialise animations per container: a new one waits for the involved containers. */
  private runExclusive(indices: number[], fn: () => Promise<void>): Promise<void> {
    const involved = indices.map((i) => this.bottles[i]);
    const prev = Promise.all(involved.map((b) => b.queue));
    const p = prev.then(fn).catch((err) => console.warn('[anim]', err));
    involved.forEach((b) => {
      b.queue = p;
      b.pendingAnimations++;
    });
    void p.finally(() => involved.forEach((b) => b.pendingAnimations--));
    return p;
  }

  private allIdle(): Promise<void> {
    return Promise.all(this.bottles.map((b) => b.queue)).then(() => undefined);
  }

  private pour(from: number, to: number): void {
    const e = this.s.engine;
    const move = e.pour(from, to);
    if (!move) return;
    this.selected = null;
    this.bottles[from].selected = false;
    const ep = this.epoch;
    void this.runExclusive([from, to], () => this.animatePour(move, ep));
    this.afterMove();
  }

  private afterMove(): void {
    const e = this.s.engine;
    const cfg = this.s.config;
    // Keep the "?" tracker authoritative (board rebuilds read from it).
    this.s.hidden.sync(e.tubes);
    this.refreshHud();
    recordInProgress(GameManager.save, cfg, e.historyPairs, e.moves, this.s.hintsUsed, this.s.undosUsed, this.s.extra);
    GameManager.commit(IN_PROGRESS_SAVE_DELAY);
    if (this.s.tutorialStep < 3) {
      this.s.tutorialStep++;
      this.updateTutorial();
    }
    const ep = this.epoch;
    if (e.isSolved()) {
      this.s.finished = true;
      void this.allIdle().then(() => ep === this.epoch && this.win());
    } else if (cfg.moveLimit && e.moves >= cfg.moveLimit) {
      this.s.finished = true;
      void this.allIdle().then(() => ep === this.epoch && this.lose('moves'));
    } else if (!e.hasUsefulMove()) {
      void this.allIdle().then(() => {
        if (ep !== this.epoch || this.s.finished || e.hasUsefulMove()) return;
        toast(this, 'No moves left. Undo a pour or restart.', { y: this.msgY, color: 0x6b2a4a });
        (this.undoUnlocked ? this.undoBtn : this.restartBtn).pulse();
      });
    }
  }

  /** Promise-wrapped 0→1 counter; tracked so a board rebuild can stop exactly these. */
  private tweenP(duration: number, ease: string, onUpdate: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const tween = this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: Math.max(1, duration),
        ease,
        onUpdate: (tw) => onUpdate(tw.getValue() ?? 0),
        onComplete: () => {
          this.animTweens.delete(tween);
          onUpdate(1);
          resolve();
        },
        onStop: () => {
          this.animTweens.delete(tween);
          resolve();
        },
      });
      this.animTweens.add(tween);
    });
  }

  private async animatePour(move: Move, ep: number): Promise<void> {
    if (ep !== this.epoch) return;
    const src = this.bottles[move.from];
    const dst = this.bottles[move.to];
    const reduce = GameManager.save.settings.reducedMotion;
    // Fast tapping queues pours; speed animations up (to 3x) as the backlog grows
    // so visuals never lag far behind the game state.
    const backlog = Math.max(0, src.pendingAnimations - 1) + Math.max(0, dst.pendingAnimations - 1);
    const rush = Math.min(3, 1 + backlog * 0.6);
    const u = this.L.u;
    this.tweens.killTweensOf(src);
    src.selected = false;
    src.setHintGlow(false);
    src.away = true;
    src.setDepth(30);

    const dir: 1 | -1 = dst.home.x >= src.home.x ? 1 : -1;
    const mouth = src.mouthLocal(dir);
    const target = { x: dst.home.x - dir * dst.geo.innerW * 0.16, y: dst.y - dst.geo.H / 2 - src.geo.H * 0.08 };
    const unitArea = src.unitArea;
    const startUnits = src.totalUnits;
    const angleFor = (units: number) => dir * pourAngleFor(src.geo, Math.max(units, 0.08) * unitArea);
    const posFor = (ang: number) => {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      return { x: target.x - (mouth.x * c - mouth.y * s), y: target.y - (mouth.x * s + mouth.y * c) };
    };

    // 1. Travel to the destination and tilt until the liquid reaches the lip.
    const a0 = angleFor(startUnits);
    const sx = src.x;
    const sy = src.y;
    const sr = src.rotation;
    GameManager.audio.play('whoosh');
    await this.tweenP((reduce ? 120 : 300) / rush, 'Sine.easeInOut', (t) => {
      const ang = sr + (a0 - sr) * t;
      const p = posFor(ang);
      src.setPosition(sx + (p.x - sx) * t, sy + (p.y - sy) * t);
      src.rotation = ang;
      src.updateShadow();
    });
    if (ep !== this.epoch) return;

    // 2. Pour: liquid leaves the source and fills the destination continuously.
    const dur = ((reduce ? 140 : 240) + move.count * (reduce ? 70 : 150)) / rush;
    const col = LIQUIDS[move.color] ?? LIQUIDS[0];
    GameManager.audio.play('pour', { duration: dur / 1000 });
    this.splash.particleTint = col.light;
    this.splash.start();
    let poured = 0;
    await this.tweenP(dur, 'Linear', (t) => {
      if (ep !== this.epoch) return;
      const want = move.count * t;
      const d = want - poured;
      poured = want;
      if (d > 0) {
        src.changeTop(move.color, -d);
        dst.changeTop(move.color, d);
      }
      const ang = angleFor(startUnits - poured);
      src.rotation = ang;
      const p = posFor(ang);
      src.setPosition(p.x, p.y);
      const surfaceY = dst.y + dst.surfaceLocalY();
      this.drawStream(target.x, target.y, dst.x - dir * dst.geo.innerW * 0.05, surfaceY, dst.geo.innerW * 0.22 * Math.min(1, 0.4 + t * 3) * (t > 0.92 ? (1 - t) / 0.08 : 1), col.base, col.light, u);
      this.splash.setPosition(dst.x, surfaceY);
    });
    this.stream.clear();
    this.splash.stop();
    if (ep !== this.epoch) return;
    src.normalize();
    dst.normalize();
    if (src.topHidden) {
      src.revealTop();
      GameManager.audio.play('reveal');
    }
    dst.slosh(0.16);
    GameManager.audio.play('land');
    GameManager.haptic(12);
    if (dst.isFullUniform()) this.celebrateTube(dst);

    // 3. Return home with a little settle.
    const x0 = src.x;
    const y0 = src.y;
    const r0 = src.rotation;
    await this.tweenP((reduce ? 120 : 300) / rush, 'Cubic.easeOut', (t) => {
      src.setPosition(x0 + (src.home.x - x0) * t, y0 + (src.home.y - y0) * t);
      src.rotation = r0 * (1 - t);
      src.updateShadow();
    });
    if (ep !== this.epoch) return;
    src.away = false;
    src.rotation = 0;
    src.setDepth(10);
    src.slosh(0.22, 800);
    // Selected while it was travelling back? Lift it now.
    if (src.selected && this.selected === src.index) src.setSelected(true);
  }

  private drawStream(x0: number, y0: number, x1: number, y1: number, width: number, color: number, light: number, u: number): void {
    const g = this.stream;
    g.clear();
    if (width <= 0.5 || y1 <= y0) return;
    const steps = 14;
    const left: Phaser.Types.Math.Vector2Like[] = [];
    const right: Phaser.Types.Math.Vector2Like[] = [];
    const wob = this.time.now / 70;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Falls in a gentle arc: horizontal component eases out quickly.
      const x = x0 + (x1 - x0) * (1 - Math.pow(1 - t, 3)) + Math.sin(wob + t * 6) * 0.8 * u;
      const y = y0 + (y1 - y0) * t;
      const w = width * (1 - t * 0.35);
      left.push({ x: x - w / 2, y });
      right.push({ x: x + w / 2, y });
    }
    g.fillStyle(color, 1);
    g.fillPoints([...left, ...right.reverse()], true);
    g.fillStyle(light, 0.7);
    const core = left.map((p, i) => ({ x: p.x + width * 0.2 * (1 - (i / steps) * 0.35), y: p.y }));
    const core2 = core.map((p, i) => ({ x: p.x + width * 0.14 * (1 - (i / steps) * 0.35), y: p.y })).reverse();
    g.fillPoints([...core, ...core2], true);
    g.fillStyle(light, 0.9);
    g.fillEllipse(x1, y1, width * 1.6, width * 0.45);
  }

  private celebrateTube(b: LiquidContainer): void {
    b.setComplete(true, true);
    this.time.delayedCall(250, () => this.syncFrozen());
    const col = LIQUIDS[b.segments[0]?.color ?? 0] ?? LIQUIDS[0];
    this.time.delayedCall(120, () => {
      GameManager.audio.play('pop');
      GameManager.audio.play('complete');
    });
    GameManager.haptic([15, 30, 15]);
    GameManager.save.stats.tubesCompleted++;
    if (!GameManager.save.settings.reducedMotion) {
      this.sparkles.particleTint = col.light;
      this.sparkles.explode(16, b.x, b.y - b.geo.H * 0.1);
      this.tweens.add({ targets: b, scaleX: 1.06, scaleY: 0.95, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    }
    this.refreshHud();
  }

  // ------------------------------------------------------------- actions

  private doUndo(): void {
    if (this.s.finished || !this.scene.isActive()) return;
    if (!this.undoUnlocked) {
      GameManager.audio.play('invalid');
      toast(this, `Undo unlocks at level ${UNDO_UNLOCK}`, { icon: 'icon-lock', y: this.msgY });
      return;
    }
    const e = this.s.engine;
    this.clearHint();
    this.deselect();
    const move = e.undo();
    if (!move) {
      toast(this, 'Nothing to undo', { y: this.msgY });
      return;
    }
    this.s.undosUsed++;
    GameManager.save.stats.undosUsed++;
    this.s.hidden.sync(e.tubes);
    GameManager.audio.play('undo');
    const ep = this.epoch;
    void this.runExclusive([move.from, move.to], () => this.animateUndo(move, ep));
    this.refreshHud();
    recordInProgress(GameManager.save, this.s.config, e.historyPairs, e.moves, this.s.hintsUsed, this.s.undosUsed, this.s.extra);
    GameManager.commit(IN_PROGRESS_SAVE_DELAY);
  }

  private async animateUndo(move: Move, ep: number): Promise<void> {
    if (ep !== this.epoch) return;
    const back = this.bottles[move.to];
    const fwd = this.bottles[move.from];
    const reduce = GameManager.save.settings.reducedMotion;
    if (back.complete) back.setComplete(false, true);
    const col = LIQUIDS[move.color] ?? LIQUIDS[0];
    if (!reduce) {
      // A spray of droplets flies back to where the liquid came from.
      for (let k = 0; k < 6; k++) {
        const d = this.add.image(back.x, back.y + back.surfaceLocalY(), 'dot').setTint(col.base).setScale(0.45 * this.L.u).setDepth(27);
        this.tweens.add({
          targets: d,
          x: fwd.x,
          y: { value: fwd.y + fwd.surfaceLocalY(), ease: 'Quad.easeIn' },
          duration: 300 + k * 30,
          delay: k * 25,
          onComplete: () => d.destroy(),
        });
      }
    }
    let moved = 0;
    await this.tweenP(reduce ? 100 : 340, 'Sine.easeInOut', (t) => {
      if (ep !== this.epoch) return;
      const want = move.count * t;
      const d = want - moved;
      moved = want;
      if (d > 0) {
        back.changeTop(move.color, -d);
        fwd.changeTop(move.color, d);
      }
    });
    if (ep !== this.epoch) return;
    back.normalize();
    fwd.normalize();
    back.slosh(0.12);
    fwd.slosh(0.12);
    if (fwd.isFullUniform() && !fwd.complete) fwd.setComplete(true, false);
    this.syncFrozen();
  }

  private doRestart(): void {
    if (this.s.finished || !this.scene.isActive()) return;
    this.clearHint();
    this.s.engine.restart();
    // A restart is a fresh attempt: mystery layers are concealed again.
    this.s.hidden = new HiddenLayers(this.s.engine.tubes.map((t) => t.slice()), !!this.s.config.hidden);
    GameManager.audio.play('whoosh');
    this.rebuildBoard();
    this.refreshHud();
    recordInProgress(GameManager.save, this.s.config, [], 0, this.s.hintsUsed, this.s.undosUsed, this.s.extra);
    GameManager.commit(IN_PROGRESS_SAVE_DELAY);
  }

  private doHint(): void {
    if (this.s.finished || !this.scene.isActive()) return;
    const save = GameManager.save;
    const y = this.msgY;
    if (!this.hintUnlocked) {
      GameManager.audio.play('invalid');
      toast(this, `Hints unlock at level ${HINT_UNLOCK}`, { icon: 'icon-lock', y });
      return;
    }
    this.deselect();
    this.clearHint();
    const e = this.s.engine;
    const hint = findHint(e.snapshot(), e.historyMoves);
    if (hint.kind === 'solved') return;
    if (hint.kind === 'undo') {
      // Free advice: the board is a dead end.
      toast(this, hint.steps === 1 ? 'Dead end! Undo your last move.' : `Dead end! Undo ${hint.steps} moves.`, { y, color: 0x6b2a4a, icon: 'icon-undo' });
      this.undoBtn.pulse(hint.steps > 1 ? 4 : 3);
      return;
    }
    if (hint.kind === 'restart') {
      toast(this, 'This board is stuck. Restart to try again.', { y, color: 0x6b2a4a, icon: 'icon-restart' });
      this.restartBtn.pulse();
      return;
    }
    if (!canAffordHint(save)) {
      GameManager.audio.play('invalid');
      toast(this, `Need ${HINT_PRICE} coins for a hint. Earn more by solving puzzles!`, { y, icon: 'coin' });
      return;
    }
    const usedCoins = save.hints === 0;
    spendHint(save);
    this.s.hintsUsed++;
    GameManager.commit();
    GameManager.audio.play('hint');
    if (usedCoins) toast(this, `-${HINT_PRICE} coins`, { y, icon: 'coin', duration: 1200 });
    this.showHint(hint.from, hint.to);
    this.refreshHud();
  }

  private showHint(from: number, to: number): void {
    const a = this.bottles[from];
    const b = this.bottles[to];
    const u = this.L.u;
    a.setHintGlow(true);
    b.setHintGlow(true);
    // Numbered badges sit just under each container, always in the gap
    // between rows, so they never collide with other bottles or the HUD.
    const badge = (bottle: LiquidContainer, label: string, delay: number) => {
      const r = Math.max(13 * u, bottle.geo.W * 0.28);
      const c = this.add.container(bottle.home.x, bottle.home.y + bottle.geo.H / 2 + r + 4 * u).setDepth(60);
      const bg = this.add.image(0, 0, panelTexture(this, r * 2, r * 2, { top: 0xffe08f, bottom: 0xf5a930, radius: r, stroke: 0xffffff, strokeAlpha: 0.9, shadow: true }));
      const t = text(this, 0, 0, label, (r / u) * 0.95, { weight: 700, color: '#5A3300' });
      c.add([bg, t]);
      c.setScale(0);
      this.tweens.add({ targets: c, scale: 1, duration: 260, delay, ease: 'Back.easeOut' });
      this.tweens.add({ targets: c, y: c.y - 5 * u, duration: 460, delay: delay + 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      return c;
    };
    this.hintMarkers.push(badge(a, '1', 0), badge(b, '2', 160));
    this.hintPair = { from, to };
  }

  private clearHint(): void {
    if (this.hintPair) {
      this.bottles[this.hintPair.from]?.setHintGlow(false);
      this.bottles[this.hintPair.to]?.setHintGlow(false);
      this.hintPair = null;
    }
    this.hintMarkers.forEach((m) => m.destroy());
    this.hintMarkers = [];
  }

  private frozenLabel(i: number): string {
    const need = this.s.engine.locks?.[i] ?? 1;
    return need === 1 ? 'Sort 1 colour' : `Sort ${need} colours`;
  }

  /** Thaw (or, after an undo, re-freeze) containers to match the engine. */
  private syncFrozen(): void {
    const e = this.s.engine;
    this.bottles.forEach((b, i) => {
      if (b.frozen && !e.isFrozen(i)) {
        b.thaw(true);
        GameManager.audio.play('pop');
        if (!GameManager.save.settings.reducedMotion) {
          this.sparkles.particleTint = 0xbfeaff;
          this.sparkles.explode(14, b.x, b.y);
        }
      } else if (!b.frozen && e.isFrozen(i)) {
        b.refreeze(this.frozenLabel(i));
      }
    });
  }

  private doExtraBottle(): void {
    if (this.s.finished || !this.scene.isActive()) return;
    const save = GameManager.save;
    if (!this.undoUnlocked) {
      GameManager.audio.play('invalid');
      toast(this, `Extra bottles unlock at level ${UNDO_UNLOCK}`, { icon: 'icon-lock', y: this.msgY });
      return;
    }
    if (this.s.extra >= 1) {
      toast(this, 'One extra bottle per puzzle.', { y: this.msgY, icon: 'icon-bottle-plus' });
      return;
    }
    if (!consumeExtraBottle(save).ok) {
      GameManager.audio.play('invalid');
      toast(this, `Need ${BOOSTS.extraBottle.price} coins for an extra bottle.`, { y: this.msgY, icon: 'coin' });
      return;
    }
    this.clearHint();
    this.deselect();
    this.s.engine.addContainer();
    this.s.extra++;
    this.s.hidden.sync(this.s.engine.tubes);
    GameManager.audio.play('pop');
    GameManager.haptic(15);
    this.rebuildBoard();
    this.refreshHud();
    const e = this.s.engine;
    recordInProgress(save, this.s.config, e.historyPairs, e.moves, this.s.hintsUsed, this.s.undosUsed, this.s.extra);
    GameManager.commit();
    toast(this, 'Extra bottle added. This puzzle now tops out at 2 stars.', { y: this.msgY, icon: 'icon-bottle-plus', duration: 2600 });
  }

  /** One-time explainer card for a new mechanic. */
  private explain(flag: string, title: string, body: string, icon: string): boolean {
    const save = GameManager.save;
    if (save.seen[flag]) return false;
    save.seen[flag] = true;
    GameManager.commit();
    const L = this.L;
    const dim = dimmer(this, 0.6).setDepth(900);
    const pw = Math.min(L.col, 330 * L.u);
    const ph = 300 * L.u;
    const panel = modalPanel(this, pw, ph, title, COLORS.blue).setDepth(901);
    panel.add(this.add.image(0, -ph / 2 + 84 * L.u, icon).setScale((56 * L.u) / 128).setTint(COLORS.yellow));
    panel.add(text(this, 0, -ph / 2 + 160 * L.u, body, 15, { weight: 500, color: CSS.textDim, wrap: pw - 48 * L.u, lineSpacing: 4 * L.u }));
    const close = () => {
      if (!panel.active) return;
      dim.destroy();
      panel.destroy();
    };
    panel.add(new Button(this, 0, ph / 2 - 44 * L.u, pw - 80 * L.u, 52 * L.u, 'GOT IT', close, { variant: 'success', icon: 'icon-check', fontSize: 18 }));
    this.input.keyboard?.once('keydown-ESC', close);
    return true;
  }

  // ------------------------------------------------------------- tutorial

  private introduceFeatures(): void {
    const save = GameManager.save;
    const cfg = this.s.config;
    if (cfg.mode !== 'classic') return;
    const lvl = cfg.level ?? 0;
    // At most one introduction per level start: a mechanic card wins over feature toasts.
    let shown = false;
    if (lvl >= MECHANIC_INTROS.hidden && cfg.hidden) {
      shown = this.explain('mech-hidden', 'Mystery Layers', 'Layers marked "?" are hidden. Each reveals its colour as soon as it reaches the top of its bottle.', 'icon-eye');
    } else if (lvl >= MECHANIC_INTROS.tall && cfg.puzzle.capacity === 5) {
      shown = this.explain('mech-tall', 'Tall Bottles', 'These bottles hold five layers instead of four. More room to juggle, and more to sort.', 'icon-bottle-plus');
    } else if (lvl >= MECHANIC_INTROS.frozen && cfg.puzzle.locks?.some((l) => l > 0)) {
      shown = this.explain('mech-frozen', 'Frozen Bottles', 'A frozen bottle cannot be used yet. Sort any one colour completely and it thaws.', 'icon-snow');
    }
    const y = this.msgY;
    if (shown) return;
    if (this.undoUnlocked && !save.seen.undo) {
      save.seen.undo = true;
      GameManager.commit();
      this.time.delayedCall(700, () => {
        toast(this, 'New! Undo takes back your last pour.', { y, icon: 'icon-undo', duration: 3200 });
        this.undoBtn.pulse(4);
      });
    } else if (this.hintUnlocked && !save.seen.hint) {
      save.seen.hint = true;
      GameManager.commit();
      this.time.delayedCall(700, () => {
        toast(this, 'New! Tap Hint to see a good next pour.', { y, icon: 'icon-hint', duration: 3200 });
        this.hintBtn.pulse(4);
      });
    }
  }

  private updateTutorial(): void {
    this.tutorialObjs.forEach((o) => o.destroy());
    this.tutorialObjs = [];
    const cfg = this.s.config;
    if (cfg.mode !== 'classic' || cfg.level !== 1 || this.s.finished || this.s.tutorialStep >= 2) return;
    const L = this.L;
    const e = this.s.engine;
    const sol = findHint(e.snapshot(), e.historyMoves);
    if (sol.kind !== 'move') return;
    const pickingUp = this.selected === null;
    const targetIdx = pickingUp ? sol.from : sol.to;
    if (!pickingUp && this.selected !== sol.from) return;
    const b = this.bottles[targetIdx];
    if (!b) return;
    const msg = pickingUp
      ? this.s.tutorialStep === 0
        ? 'Tap a bottle to pick it up'
        : 'Great! Pick up another bottle'
      : 'Now tap a bottle with the same colour on top, or an empty one';
    const banner = text(this, L.cx, this.msgY, msg, 15, { weight: 600, wrap: L.col * 0.9, shadow: true }).setDepth(60);
    const hand = this.add.image(b.home.x + b.geo.W * 0.35, b.home.y + b.geo.H * 0.1, 'icon-hand').setScale((44 * L.u) / 128).setDepth(60);
    this.tweens.add({ targets: hand, x: hand.x - 6 * L.u, y: hand.y - 14 * L.u, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tutorialObjs.push(banner, hand);
  }

  // ------------------------------------------------------------- outcome

  private stats(): PlayStats {
    const cfg = this.s.config;
    return {
      moves: this.s.engine.moves,
      hintsUsed: this.s.hintsUsed,
      undosUsed: this.s.undosUsed,
      extraUsed: this.s.extra,
      elapsed: this.s.elapsed,
      timeLeft: cfg.timeLimit ? Math.max(0, cfg.timeLimit - this.s.elapsed) : undefined,
    };
  }

  private win(): void {
    if (this.s.won) return;
    this.s.won = true;
    this.input.enabled = false;
    this.clearHint();
    this.updateTutorial();
    const save = GameManager.save;
    if (this.s.config.level === 1) save.seen.tutorial = true;
    const result = applyWin(save, this.s.config, this.stats());
    void GameManager.commitNow();
    GameManager.audio.play('win');
    GameManager.haptic([20, 40, 20, 40, 60]);
    const L = this.L;
    const reduce = save.settings.reducedMotion;
    if (!reduce) {
      this.confetti.explode(70, L.w * 0.2, L.h * 0.95);
      this.confetti.explode(70, L.w * 0.8, L.h * 0.95);
      this.bottles.forEach((b, i) => {
        this.tweens.add({ targets: b, y: b.home.y - 18 * L.u, duration: 220, delay: i * 55, yoyo: true, ease: 'Quad.easeOut' });
      });
    }
    this.time.delayedCall(reduce ? 300 : 1100, () => this.scene.launch('Completion', { result }));
  }

  private lose(reason: LossReason): void {
    if (this.s.lost) return;
    this.s.finished = true;
    this.s.lost = reason;
    this.input.enabled = false;
    this.clearHint();
    if (this.s.config.mode === 'classic' && GameManager.save.inProgress?.level === this.s.config.level) {
      GameManager.save.inProgress = null;
      GameManager.commit();
    }
    GameManager.audio.play('lose');
    GameManager.haptic([40, 60, 40]);
    this.cameras.main.shake(220, 0.004);
    this.time.delayedCall(500, () => this.scene.launch('GameOver', { config: this.s.config, reason, stats: this.stats() }));
  }

  private openPause(): void {
    if (this.s.finished || !this.scene.isActive()) return;
    this.deselect();
    this.scene.pause();
    this.scene.launch('Pause', { config: this.s.config });
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    for (const b of this.bottles) b.tick();
    if (this.s.finished) return;
    this.s.elapsed += Math.min(delta, 250) / 1000;
    const limit = this.s.config.timeLimit;
    if (limit && this.timerText) {
      const left = Math.max(0, limit - this.s.elapsed);
      const sec = Math.ceil(left);
      if (sec !== this.lastTimerSecond) {
        this.lastTimerSecond = sec;
        this.timerText.setText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
        const urgent = sec <= 10;
        this.timerText.setColor(urgent ? '#FFD0D7' : '#FFFFFF');
        if (urgent && sec > 0 && this.timerPill) {
          GameManager.audio.play('click');
          this.tweens.add({ targets: this.timerPill, scale: 1.1, duration: 120, yoyo: true });
        }
      }
      if (left <= 0) {
        this.s.finished = true;
        this.lose('time');
      }
    }
  }
}

/** Test hook: clear the persisted session (used when abandoning a game). */
export function resetGameSession(): void {
  session = null;
}
