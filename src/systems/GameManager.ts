import type Phaser from 'phaser';
import { setLiquidPalette } from '../config/theme';
import { PALETTES } from '../data/catalog';
import { getPlatform, type PlatformAdapter } from '../integrations/playables';
import type { SaveData } from '../types/save';
import { AudioManager } from './AudioManager';
import { SaveManager } from './SaveManager';

type Listener = () => void;

/**
 * Process-wide game services. Scenes read from here; nothing here depends on
 * a particular scene, so the lifecycle (pause/resume/audio) works everywhere.
 */
class GameManagerImpl {
  readonly platform: PlatformAdapter;
  readonly saves: SaveManager;
  readonly audio = new AudioManager();
  game: Phaser.Game | null = null;
  paused = false;
  language = 'en';
  private changeListeners = new Set<Listener>();
  private pauseListeners = new Set<(paused: boolean) => void>();
  private lastReportedScore = -1;

  constructor() {
    this.platform = getPlatform();
    this.saves = new SaveManager(this.platform);
  }

  get save(): SaveData {
    return this.saves.data;
  }

  get audioEnabledByPlatform(): boolean {
    return this.platform.isAudioEnabled();
  }

  async init(): Promise<void> {
    await this.saves.load();
    this.applySettings();
    this.audio.setPlatformAudio(this.platform.isAudioEnabled());
    this.platform.onAudioEnabledChange((enabled) => {
      this.audio.setPlatformAudio(enabled);
      this.emitChange();
    });
    this.platform.onPause(() => this.pause());
    this.platform.onResume(() => this.resume());
    this.platform
      .getLanguage()
      .then((l) => (this.language = l || 'en'))
      .catch(() => undefined);
    this.lastReportedScore = -1;
  }

  attach(game: Phaser.Game): void {
    this.game = game;
  }

  /** Platform onPause: stop all execution and save. Only onResume may restart us. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.audio.setPaused(true);
    this.pauseListeners.forEach((cb) => cb(true));
    void this.saves.flush();
    this.game?.loop.sleep();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.game?.loop.wake();
    this.audio.setPaused(false);
    this.pauseListeners.forEach((cb) => cb(false));
  }

  onPauseChange(cb: (paused: boolean) => void): () => void {
    this.pauseListeners.add(cb);
    return () => this.pauseListeners.delete(cb);
  }

  /** Subscribe to save-data changes (coins, settings…). */
  onChange(cb: Listener): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  emitChange(): void {
    this.changeListeners.forEach((cb) => cb());
  }

  applySettings(): void {
    const s = this.save.settings;
    this.audio.setVolumes(s.music, s.sfx);
    const palette = PALETTES.find((p) => p.id === this.save.cosmetics.palette) ?? PALETTES[0];
    setLiquidPalette(palette.colors);
  }

  /** Persist soon (debounced) and notify listeners. */
  commit(delayMs = 400): void {
    this.saves.save(delayMs);
    this.emitChange();
  }

  /** Persist right now. Used at material progress (level change). */
  async commitNow(): Promise<void> {
    this.emitChange();
    await this.saves.flush();
    await this.reportScore();
  }

  /** Report the single score dimension (sum of best Classic scores), matching the save. */
  async reportScore(): Promise<void> {
    const score = this.save.bestTotalScore;
    if (score <= 0 || score === this.lastReportedScore) return;
    this.lastReportedScore = score;
    try {
      await this.platform.sendScore(score);
    } catch (e) {
      console.warn('[score] sendScore failed', e);
    }
  }

  haptic(pattern: number | number[] = 12): void {
    if (!this.save.settings.haptics) return;
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
    } catch {
      /* unsupported */
    }
  }
}

export const GameManager = new GameManagerImpl();
