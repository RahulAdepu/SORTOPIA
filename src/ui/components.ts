import Phaser from 'phaser';
import { COLORS, CSS, FONT, shade } from '../config/theme';
import { layoutOf } from '../config/layout';
import { GameManager } from '../systems/GameManager';
import { panelTexture } from './TextureFactory';

export interface TextOpts {
  color?: string;
  weight?: 400 | 500 | 600 | 700;
  align?: 'left' | 'center' | 'right';
  stroke?: string;
  strokeWidth?: number;
  shadow?: boolean;
  wrap?: number;
  origin?: [number, number];
  lineSpacing?: number;
}

/** Crisp text sized in design units (scaled to device pixels). */
export function text(scene: Phaser.Scene, x: number, y: number, str: string, size: number, opts: TextOpts = {}): Phaser.GameObjects.Text {
  const L = layoutOf(scene);
  const px = Math.max(9, Math.round(size * L.u * L.textScale));
  const t = scene.add.text(x, y, str, {
    fontFamily: FONT.family,
    fontSize: `${px}px`,
    fontStyle: String(opts.weight ?? 600),
    color: opts.color ?? CSS.text,
    align: opts.align ?? 'center',
    stroke: opts.stroke,
    strokeThickness: opts.stroke ? (opts.strokeWidth ?? Math.max(2, px * 0.12)) : 0,
    wordWrap: opts.wrap ? { width: opts.wrap, useAdvancedWrap: true } : undefined,
    lineSpacing: opts.lineSpacing ?? Math.round(px * 0.1),
    padding: { x: 2, y: Math.ceil(px * 0.12) },
  });
  if (opts.shadow) t.setShadow(0, Math.max(1, px * 0.07), 'rgba(6,6,26,0.55)', Math.max(1, px * 0.08), true, true);
  const o = opts.origin ?? [0.5, 0.5];
  t.setOrigin(o[0], o[1]);
  return t;
}

/** Shrink a text object until it fits a maximum width. */
export function fitText(t: Phaser.GameObjects.Text, maxWidth: number): Phaser.GameObjects.Text {
  if (t.width > maxWidth && t.width > 0) t.setScale(maxWidth / t.width);
  return t;
}

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, { top: number; bottom: number; text: string }> = {
  primary: { top: 0xffa6d0, bottom: 0xe2549a, text: '#FFFFFF' },
  secondary: { top: 0x4a5199, bottom: 0x353b7c, text: '#FFFFFF' },
  success: { top: 0x8ef0c4, bottom: 0x2fb487, text: '#FFFFFF' },
  warning: { top: 0xffe08f, bottom: 0xf5a930, text: '#5A3300' },
  ghost: { top: 0x2b3068, bottom: 0x232857, text: '#DDE0FF' },
  danger: { top: 0xff9aa8, bottom: 0xe0485f, text: '#FFFFFF' },
};

export interface ButtonOpts {
  variant?: ButtonVariant;
  icon?: string;
  iconSize?: number;
  fontSize?: number;
  /** Small secondary line under the label. */
  sub?: string;
  disabled?: boolean;
  sound?: boolean;
  /** Radius as fraction of height (0.5 = pill). */
  round?: number;
}

/**
 * Pressable 3-D button. Fires on release while still over the button, with
 * press animation, sound and haptic. Works identically for touch and mouse.
 */
export class Button extends Phaser.GameObjects.Container {
  private bodyImg: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text | null = null;
  icon: Phaser.GameObjects.Image | null = null;
  private pressed = false;
  private enabled = true;
  readonly bw: number;
  readonly bh: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, labelText: string, private onClick: () => void, opts: ButtonOpts = {}) {
    super(scene, x, y);
    const L = layoutOf(scene);
    this.bw = w;
    this.bh = h;
    const v = VARIANTS[opts.variant ?? 'primary'];
    const lip = Math.round(h * 0.09);
    const key = panelTexture(scene, w, h, {
      top: v.top,
      bottom: v.bottom,
      radius: h * (opts.round ?? 0.38),
      lip,
      lipColor: shade(v.bottom, -0.38),
      shadow: true,
      gloss: true,
    });
    this.bodyImg = scene.add.image(0, 0, key);
    this.add(this.bodyImg);
    const contentY = -lip / 2;
    const fontSize = opts.fontSize ?? Math.min(22, (h / L.u) * 0.38);
    let iconW = 0;
    if (opts.icon) {
      const texW = scene.textures.get(opts.icon).getSourceImage().width || 128;
      const s = (opts.iconSize ?? h * 0.46) / texW;
      this.icon = scene.add.image(0, contentY, opts.icon).setScale(s);
      // Glyph icons follow the dark text colour on light buttons; artwork (coins) keeps its colours.
      if (opts.variant === 'warning' && opts.icon.startsWith('icon-')) this.icon.setTint(0x5a3300);
      this.add(this.icon);
      iconW = texW * s;
    }
    if (labelText) {
      this.label = text(scene, 0, contentY, labelText, fontSize, { color: v.text, weight: 700, shadow: v.text === '#FFFFFF' });
      let sub: Phaser.GameObjects.Text | null = null;
      if (opts.sub) {
        this.label.setY(contentY - h * 0.12);
        sub = text(scene, 0, contentY + h * 0.2, opts.sub, fontSize * 0.55, { color: v.text, weight: 500 });
        sub.setAlpha(0.85);
        this.add(sub);
      }
      this.add(this.label);
      const maxLabel = w - (iconW ? iconW + h * 0.5 : h * 0.4);
      fitText(this.label, maxLabel);
      if (this.icon) {
        // Icon + text block (label and optional sub-label) centred as one unit.
        const gap = h * 0.14;
        const blockW = Math.max(this.label.displayWidth, sub?.displayWidth ?? 0);
        const total = iconW + gap + blockW;
        const textX = -total / 2 + iconW + gap + blockW / 2;
        this.icon.setX(-total / 2 + iconW / 2);
        this.label.setX(textX);
        sub?.setX(textX);
      }
    }
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.pressed = true;
      scene.tweens.killTweensOf(this);
      scene.tweens.add({ targets: this, scale: 0.93, duration: 70, ease: 'Quad.easeOut' });
    });
    const release = (fire: boolean) => {
      if (!this.pressed) return;
      this.pressed = false;
      scene.tweens.killTweensOf(this);
      scene.tweens.add({ targets: this, scale: 1, duration: 220, ease: 'Back.easeOut' });
      if (fire && this.enabled) {
        if (opts.sound !== false) GameManager.audio.play('click');
        GameManager.haptic(8);
        this.onClick();
      }
    };
    this.on('pointerup', () => release(true));
    this.on('pointerout', () => release(false));
    if (opts.disabled) this.setEnabled(false);
    scene.add.existing(this);
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.45);
    return this;
  }

  setHandler(fn: () => void): this {
    this.onClick = fn;
    return this;
  }
}

/** Circular icon button with optional caption and badge (used in game HUD). */
export class IconButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  private badge: Phaser.GameObjects.Container | null = null;
  private badgeKey = '';
  private lockIcon: Phaser.GameObjects.Image | null = null;
  private pressed = false;
  private enabledFlag = true;
  readonly size: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    size: number,
    iconKey: string,
    private onClick: () => void,
    opts: { variant?: ButtonVariant; caption?: string; tint?: number } = {},
  ) {
    super(scene, x, y);
    this.size = size;
    const v = VARIANTS[opts.variant ?? 'secondary'];
    const lip = Math.round(size * 0.08);
    this.bg = scene.add.image(0, 0, panelTexture(scene, size, size, { top: v.top, bottom: v.bottom, radius: size * 0.34, lip, lipColor: shade(v.bottom, -0.4), shadow: true, gloss: true }));
    this.icon = scene.add.image(0, -lip / 2, iconKey).setScale((size * 0.48) / 128);
    if (opts.tint !== undefined) this.icon.setTint(opts.tint);
    this.add([this.bg, this.icon]);
    if (opts.caption) {
      const cap = text(scene, 0, size * 0.5 + size * 0.2, opts.caption, Math.max(10, (size / layoutOf(scene).u) * 0.2), { color: CSS.textDim, weight: 600 });
      this.add(cap);
    }
    this.setSize(size, size);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      this.pressed = true;
      scene.tweens.killTweensOf(this);
      scene.tweens.add({ targets: this, scale: 0.9, duration: 70 });
    });
    const release = (fire: boolean) => {
      if (!this.pressed) return;
      this.pressed = false;
      scene.tweens.killTweensOf(this);
      scene.tweens.add({ targets: this, scale: 1, duration: 220, ease: 'Back.easeOut' });
      if (fire) {
        GameManager.audio.play('click');
        GameManager.haptic(8);
        this.onClick();
      }
    };
    this.on('pointerup', () => release(true));
    this.on('pointerout', () => release(false));
    scene.add.existing(this);
  }

  /** Small pill in the corner: a count, or a price with an icon (e.g. coin + 30). */
  setBadge(value: string | null, color: number = COLORS.pink, iconKey?: string): this {
    const key = `${value}|${color}|${iconKey ?? ''}`;
    if (key === this.badgeKey) return this;
    this.badgeKey = key;
    this.badge?.destroy();
    this.badge = null;
    if (value === null) return this;
    const u = layoutOf(this.scene).u;
    const h = this.size * 0.42;
    const label = text(this.scene, 0, 0, value, (h / u) * 0.62, { weight: 700 });
    const iconW = iconKey ? h * 0.78 : 0;
    const w = Math.max(h * 1.3, label.width + iconW + h * 0.55);
    const c = this.scene.add.container(this.size * 0.42, -this.size * 0.42);
    const bg = this.scene.add.image(0, 0, panelTexture(this.scene, w, h, { top: shade(color, 0.2), bottom: color, radius: h / 2, stroke: 0xffffff, strokeAlpha: 0.9 }));
    c.add(bg);
    if (iconKey) {
      const ic = this.scene.add.image(-w / 2 + h * 0.28 + iconW / 2, 0, iconKey).setScale(iconW / (iconKey === 'coin' ? 96 : 128));
      label.setX(ic.x + iconW / 2 + label.width / 2 + h * 0.06);
      c.add(ic);
    }
    c.add(label);
    this.add(c);
    this.badge = c;
    return this;
  }

  setLocked(locked: boolean): this {
    this.enabledFlag = !locked;
    this.icon.setAlpha(locked ? 0.35 : 1);
    if (locked && !this.lockIcon) {
      this.lockIcon = this.scene.add.image(this.size * 0.3, this.size * 0.26, 'icon-lock').setScale((this.size * 0.3) / 128).setTint(COLORS.yellow);
      this.add(this.lockIcon);
    }
    this.lockIcon?.setVisible(locked);
    return this;
  }

  get locked(): boolean {
    return !this.enabledFlag;
  }

  /** Attention pulse (e.g. suggest Undo at a dead end). */
  pulse(times = 3): void {
    this.scene.tweens.add({ targets: this, scale: 1.14, duration: 220, yoyo: true, repeat: times - 1, ease: 'Sine.easeInOut' });
  }
}

/** Rounded info pill: icon + value (coins, stars, moves…). */
export class Pill extends Phaser.GameObjects.Container {
  readonly valueText: Phaser.GameObjects.Text;
  readonly iconImg: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, iconKey: string, value: string, opts: { iconTint?: number; iconScale?: number } = {}) {
    super(scene, x, y);
    const bg = scene.add.image(0, 0, panelTexture(scene, w, h, { top: 0x2c3270, bottom: 0x1e2352, radius: h / 2, stroke: 0x5a62b8, strokeAlpha: 0.6 }));
    this.iconImg = scene.add.image(-w / 2 + h * 0.52, 0, iconKey).setScale(((opts.iconScale ?? 0.82) * h) / (iconKey === 'coin' ? 96 : iconKey.startsWith('star') ? 160 : 128));
    if (opts.iconTint !== undefined) this.iconImg.setTint(opts.iconTint);
    const L = layoutOf(scene);
    this.valueText = text(scene, h * 0.36, 0, value, (h / L.u) * 0.46, { weight: 700 });
    fitText(this.valueText, w - h * 1.2);
    this.add([bg, this.iconImg, this.valueText]);
    this.setSize(w, h);
    scene.add.existing(this);
  }

  setValue(v: string): void {
    this.valueText.setText(v);
  }

  bump(): void {
    this.scene.tweens.add({ targets: this.iconImg, scale: this.iconImg.scale * 1.3, duration: 120, yoyo: true });
  }
}

/** On/off switch. */
export class Toggle extends Phaser.GameObjects.Container {
  private knob: Phaser.GameObjects.Image;
  private trackOn: Phaser.GameObjects.Image;
  private value: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, h: number, initial: boolean, private onChange: (v: boolean) => void) {
    super(scene, x, y);
    const w = h * 1.8;
    const off = scene.add.image(0, 0, panelTexture(scene, w, h, { top: 0x1a1e45, bottom: 0x272d63, radius: h / 2, stroke: 0x4b53a4 }));
    this.trackOn = scene.add.image(0, 0, panelTexture(scene, w, h, { top: 0x8ef0c4, bottom: 0x2fb487, radius: h / 2, stroke: 0xffffff, strokeAlpha: 0.5 }));
    this.knob = scene.add.image(0, 0, panelTexture(scene, h * 0.8, h * 0.8, { top: 0xffffff, bottom: 0xdfe3ff, radius: h * 0.4, shadow: true }));
    this.add([off, this.trackOn, this.knob]);
    this.value = initial;
    this.render(false);
    this.setSize(w + h * 0.4, h + h * 0.4);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerup', () => {
      this.value = !this.value;
      GameManager.audio.play('toggle');
      GameManager.haptic(8);
      this.render(true);
      this.onChange(this.value);
    });
    scene.add.existing(this);
  }

  private render(animate: boolean): void {
    const w = this.trackOn.width;
    const h = this.knob.width / 0.8;
    const x = this.value ? w / 2 - h / 2 : -w / 2 + h / 2;
    if (animate) {
      this.scene.tweens.add({ targets: this.knob, x, duration: 160, ease: 'Quad.easeOut' });
      this.scene.tweens.add({ targets: this.trackOn, alpha: this.value ? 1 : 0, duration: 160 });
    } else {
      this.knob.x = x;
      this.trackOn.alpha = this.value ? 1 : 0;
    }
  }
}

/** Horizontal slider 0..1 (draggable, tappable). */
export class Slider extends Phaser.GameObjects.Container {
  private fill: Phaser.GameObjects.Graphics;
  private knob: Phaser.GameObjects.Image;
  private value: number;

  constructor(scene: Phaser.Scene, x: number, y: number, private sw: number, private sh: number, initial: number, private onChange: (v: number, final: boolean) => void, private color: number = COLORS.pink) {
    super(scene, x, y);
    const track = scene.add.image(0, 0, panelTexture(scene, sw, sh, { top: 0x1a1e45, bottom: 0x272d63, radius: sh / 2, stroke: 0x4b53a4 }));
    this.fill = scene.add.graphics();
    const k = sh * 2.1;
    this.knob = scene.add.image(0, 0, panelTexture(scene, k, k, { top: 0xffffff, bottom: 0xdfe3ff, radius: k / 2, shadow: true, stroke: shade(color, -0.1) }));
    this.add([track, this.fill, this.knob]);
    this.value = initial;
    this.redraw();
    const hit = scene.add.zone(0, 0, sw + k, k * 1.6).setInteractive({ useHandCursor: true });
    this.add(hit);
    let dragging = false;
    const update = (p: Phaser.Input.Pointer, final: boolean) => {
      const local = this.getWorldTransformMatrix().applyInverse(p.x, p.y).x;
      this.value = Phaser.Math.Clamp((local + sw / 2) / sw, 0, 1);
      this.redraw();
      this.onChange(this.value, final);
    };
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragging = true;
      update(p, false);
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (dragging && p.isDown) update(p, false);
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (dragging) {
        dragging = false;
        update(p, true);
      }
    });
    scene.add.existing(this);
  }

  private redraw(): void {
    const { sw, sh } = this;
    this.fill.clear();
    const fw = Math.max(sh, sw * this.value);
    this.fill.fillStyle(this.color, 1);
    this.fill.fillRoundedRect(-sw / 2, -sh / 2, fw, sh, sh / 2);
    this.knob.x = -sw / 2 + sw * this.value;
  }
}

/** Transient message banner. */
export function toast(scene: Phaser.Scene, message: string, opts: { y?: number; color?: number; duration?: number; icon?: string } = {}): void {
  const L = layoutOf(scene);
  const y = opts.y ?? L.h * 0.2;
  const label = text(scene, 0, 0, message, 16, { weight: 600, wrap: L.col * 0.86 });
  const w = Math.min(L.col, label.width + 48 * L.u + (opts.icon ? 28 * L.u : 0));
  const h = label.height + 22 * L.u;
  const c = scene.add.container(L.cx, y).setDepth(5000);
  const bg = scene.add.image(0, 0, panelTexture(scene, w, h, { top: shade(opts.color ?? COLORS.panelLight, 0.08), bottom: opts.color ?? COLORS.panel, radius: h / 2, stroke: 0xffffff, strokeAlpha: 0.25, shadow: true }));
  c.add([bg, label]);
  if (opts.icon) {
    const ic = scene.add.image(-w / 2 + 26 * L.u, 0, opts.icon).setScale((22 * L.u) / 128);
    label.setX(12 * L.u);
    c.add(ic);
  }
  c.setAlpha(0).setScale(0.85);
  scene.tweens.add({ targets: c, alpha: 1, scale: 1, y: y + 4 * L.u, duration: 260, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, y: y - 12 * L.u, delay: opts.duration ?? 2200, duration: 300, onComplete: () => c.destroy() });
}

/** Dimmed full-screen blocker for modal overlays; tapping it optionally closes. */
export function dimmer(scene: Phaser.Scene, alpha = 0.72, onTap?: () => void): Phaser.GameObjects.Rectangle {
  const L = layoutOf(scene);
  const r = scene.add.rectangle(L.cx, L.cy, L.w, L.h, 0x070818, alpha).setInteractive();
  if (onTap) r.on('pointerup', onTap);
  r.setAlpha(0);
  scene.tweens.add({ targets: r, alpha: 1, duration: 200 });
  return r;
}

/** Modal panel card with a title ribbon. Returns the container (centered). */
export function modalPanel(scene: Phaser.Scene, w: number, h: number, title: string, accent: number = COLORS.purple): Phaser.GameObjects.Container {
  const L = layoutOf(scene);
  const c = scene.add.container(L.cx, L.cy);
  const bg = scene.add.image(0, 0, panelTexture(scene, w, h, { top: 0x2f3572, bottom: 0x1d2150, radius: 28 * L.u, stroke: 0x6f78d6, strokeAlpha: 0.55, shadow: true }));
  const rw = Math.min(w * 0.82, 300 * L.u);
  const rh = 52 * L.u;
  const ribbon = scene.add.image(0, -h / 2, panelTexture(scene, rw, rh, { top: shade(accent, 0.3), bottom: shade(accent, -0.1), radius: rh * 0.42, lip: Math.round(rh * 0.1), shadow: true, gloss: true }));
  const t = text(scene, 0, -h / 2 - rh * 0.04, title, 24, { weight: 700, shadow: true });
  fitText(t, rw * 0.86);
  c.add([bg, ribbon, t]);
  c.setScale(0.7).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
  return c;
}

/** Fade the camera out and start another scene. */
export function goTo(scene: Phaser.Scene, key: string, data?: object): void {
  if ((scene as unknown as { __leaving?: boolean }).__leaving) return;
  (scene as unknown as { __leaving?: boolean }).__leaving = true;
  const reduce = GameManager.save.settings.reducedMotion;
  scene.input.enabled = false;
  scene.cameras.main.fadeOut(reduce ? 80 : 220, 23, 27, 54);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.scene.start(key, data);
  });
}

export function fadeIn(scene: Phaser.Scene): void {
  (scene as unknown as { __leaving?: boolean }).__leaving = false;
  scene.cameras.main.fadeIn(GameManager.save.settings.reducedMotion ? 80 : 260, 23, 27, 54);
}
