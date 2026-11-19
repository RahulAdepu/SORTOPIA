import Phaser from 'phaser';
import { layoutOf, type Layout } from '../config/layout';
import { COLORS, CSS } from '../config/theme';
import { GameManager } from '../systems/GameManager';
import type { Settings } from '../types/save';
import { Button, dimmer, fitText, IconButton, modalPanel, Slider, text, Toggle } from '../ui/components';

/**
 * Settings overlay. Per Playables guidance there is no master mute button
 * (the YouTube mute always wins), only separate Music and Sound FX volumes.
 */
export class SettingsScene extends Phaser.Scene {
  private from = 'MainMenu';
  private before!: Settings;
  private panel!: Phaser.GameObjects.Container;
  private credits: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Settings');
  }

  create(data: { from?: string }): void {
    this.from = data.from ?? 'MainMenu';
    this.credits = null;
    this.before = { ...GameManager.save.settings };
    if (this.from === 'MainMenu' && this.scene.isActive('MainMenu')) this.scene.pause('MainMenu');
    const L = layoutOf(this);
    dimmer(this, 0.72);
    const pw = Math.min(L.col, 370 * L.u);
    const ph = Math.min(L.h * 0.92, 560 * L.u);
    this.panel = modalPanel(this, pw, ph, 'Settings', COLORS.purple);
    const p = this.panel;
    const top = -ph / 2;
    const left = -pw / 2 + 24 * L.u;
    const right = pw / 2 - 24 * L.u;
    const s = GameManager.save.settings;
    const rowH = Math.min(58 * L.u, (ph - 190 * L.u) / 7);

    p.add(new IconButton(this, pw / 2 - 10 * L.u, top + 10 * L.u, 40 * L.u, 'icon-close', () => this.close()));

    let y = top + 64 * L.u;
    if (!GameManager.audioEnabledByPlatform) {
      p.add(text(this, 0, y - 12 * L.u, 'Sound is muted by YouTube', 11, { weight: 600, color: CSS.gold }));
      y += 6 * L.u;
    }
    const label = (iy: number, icon: string, title: string, sub?: string) => {
      p.add(this.add.image(left + 14 * L.u, iy, icon).setScale((24 * L.u) / 128).setTint(COLORS.textDim));
      const t = text(this, left + 36 * L.u, sub ? iy - 8 * L.u : iy, title, 15, { weight: 600, origin: [0, 0.5] });
      fitText(t, pw * 0.5);
      p.add(t);
      if (sub) {
        const st = text(this, left + 36 * L.u, iy + 10 * L.u, sub, 11, { weight: 500, color: CSS.textMuted, origin: [0, 0.5] });
        fitText(st, pw * 0.5);
        p.add(st);
      }
    };
    const sliderW = pw * 0.36;

    y += rowH * 0.5;
    label(y, 'icon-music', 'Music');
    p.add(new Slider(this, right - sliderW / 2, y, sliderW, 10 * L.u, s.music, (v, final) => this.set('music', v, final), COLORS.purple));
    y += rowH;
    label(y, 'icon-sound', 'Sound FX');
    p.add(new Slider(this, right - sliderW / 2, y, sliderW, 10 * L.u, s.sfx, (v, final) => this.set('sfx', v, final), COLORS.pink));
    y += rowH;
    const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    label(y, 'icon-vibrate', 'Haptics', canVibrate ? 'Vibration feedback' : 'Not supported on this device');
    p.add(new Toggle(this, right - 26 * L.u, y, 28 * L.u, s.haptics, (v) => this.set('haptics', v, true)));
    y += rowH;
    label(y, 'icon-eye', 'Colour symbols', 'Shapes on every colour');
    p.add(new Toggle(this, right - 26 * L.u, y, 28 * L.u, s.colorSymbols, (v) => this.set('colorSymbols', v, true)));
    y += rowH;
    label(y, 'icon-motion', 'Reduce motion', 'Calmer, shorter animations');
    p.add(new Toggle(this, right - 26 * L.u, y, 28 * L.u, s.reducedMotion, (v) => this.set('reducedMotion', v, true)));
    y += rowH;
    label(y, 'icon-text', 'Larger text');
    p.add(new Toggle(this, right - 26 * L.u, y, 28 * L.u, s.largeText, (v) => this.set('largeText', v, true)));

    const bw = pw - 48 * L.u;
    p.add(new Button(this, 0, ph / 2 - 98 * L.u, bw, 46 * L.u, 'CREDITS', () => this.showCredits(L), { variant: 'secondary', icon: 'icon-info', fontSize: 16 }));
    p.add(new Button(this, 0, ph / 2 - 40 * L.u, bw, 50 * L.u, 'DONE', () => this.close(), { variant: 'success', icon: 'icon-check', fontSize: 18 }));

    this.input.keyboard?.on('keydown-ESC', () => (this.credits ? this.hideCredits() : this.close()));
  }

  private set<K extends keyof Settings>(key: K, value: Settings[K], final: boolean): void {
    GameManager.save.settings[key] = value;
    GameManager.applySettings();
    if (final) {
      GameManager.commit();
      if (key === 'sfx') GameManager.audio.play('select');
    }
  }

  private showCredits(L: Layout): void {
    if (this.credits) return;
    const pw = Math.min(L.col, 340 * L.u);
    const ph = 430 * L.u;
    const c = modalPanel(this, pw, ph, 'Credits', COLORS.pink);
    const lines = [
      ['Sortopia', 'The Ultimate Color Sort Challenge'],
      ['Made by', 'MindGrid Labs Pvt. Ltd.'],
      ['Website', 'mindgridlabs.org'],
      ['Music (CC0)', 'MintoDog, isaiah658'],
      ['Sound effects (CC0)', 'Kenney, rubberduck, BMacZero, EZduzziteh'],
      ['Typeface', 'Fredoka (SIL Open Font License)'],
      ['Engine', 'Phaser 3 (MIT)'],
    ];
    let y = -ph / 2 + 64 * L.u;
    for (const [a, b] of lines) {
      c.add(text(this, 0, y, a, 11, { weight: 600, color: CSS.textDim }));
      c.add(text(this, 0, y + 17 * L.u, b, 15, { weight: 700, wrap: pw - 40 * L.u }));
      y += 46 * L.u;
    }
    c.add(new Button(this, 0, ph / 2 - 40 * L.u, pw - 60 * L.u, 46 * L.u, 'CLOSE', () => this.hideCredits(), { variant: 'secondary', fontSize: 16 }));
    this.credits = c;
  }

  private hideCredits(): void {
    this.credits?.destroy();
    this.credits = null;
  }

  private close(): void {
    const s = GameManager.save.settings;
    const visualChanged = s.colorSymbols !== this.before.colorSymbols || s.reducedMotion !== this.before.reducedMotion || s.largeText !== this.before.largeText;
    GameManager.commit();
    this.scene.stop();
    if (this.from === 'MainMenu') {
      if (visualChanged) this.scene.get('MainMenu').scene.restart();
      else this.scene.resume('MainMenu');
    } else if (visualChanged) {
      // Rebuild the game (state is kept in its session) and the pause menu over it.
      const game = this.scene.get('Game');
      const pause = this.scene.get('Pause');
      game.scene.restart(game.sys.settings.data);
      pause.scene.restart(pause.sys.settings.data);
    }
  }
}
