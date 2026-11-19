import type { PlatformAdapter } from './PlatformAdapter';

/**
 * Development / standalone-web stand-in for the Playables SDK.
 *
 * Used ONLY when the game is not running inside the Playables environment
 * (local dev, games.mindgridlabs.org). Inside Playables the real adapter is
 * used and progress goes exclusively through ytgame.game.saveData.
 *
 * Exposes `window.sortopiaMock` so testers can simulate platform lifecycle
 * events from the browser console:
 *   sortopiaMock.pause(); sortopiaMock.resume(); sortopiaMock.setAudio(false);
 *   sortopiaMock.clearSave(); sortopiaMock.calls  // log of SDK calls
 */
export interface MockControls {
  pause(): void;
  resume(): void;
  setAudio(enabled: boolean): void;
  clearSave(): void;
  readonly calls: string[];
  lastScore: number | null;
}

declare global {
  interface Window {
    sortopiaMock?: MockControls;
  }
}

const STORAGE_KEY = 'sortopia.web.save.v1';

export class WebMockAdapter implements PlatformAdapter {
  readonly kind = 'web' as const;
  private audioEnabled = true;
  private audioListeners = new Set<(enabled: boolean) => void>();
  private pauseListeners = new Set<() => void>();
  private resumeListeners = new Set<() => void>();
  private memorySave = '';
  readonly calls: string[] = [];
  private lastScore: number | null = null;

  constructor(private readonly persist = true) {
    if (typeof window !== 'undefined') {
      const controls: MockControls = {
        pause: () => this.pauseListeners.forEach((cb) => cb()),
        resume: () => this.resumeListeners.forEach((cb) => cb()),
        setAudio: (enabled: boolean) => {
          this.audioEnabled = enabled;
          this.audioListeners.forEach((cb) => cb(enabled));
        },
        clearSave: () => {
          this.memorySave = '';
          this.storage()?.removeItem(STORAGE_KEY);
        },
        calls: this.calls,
        lastScore: null,
      };
      Object.defineProperty(controls, 'lastScore', { get: () => this.lastScore });
      window.sortopiaMock = controls;
    }
  }

  private log(entry: string): void {
    this.calls.push(entry);
    if (this.calls.length > 200) this.calls.shift();
  }

  private storage(): Storage | null {
    if (!this.persist) return null;
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  }

  firstFrameReady(): void {
    this.log('firstFrameReady');
  }

  gameReady(): void {
    this.log('gameReady');
  }

  async loadData(): Promise<string> {
    this.log('loadData');
    const s = this.storage();
    if (s) {
      try {
        return s.getItem(STORAGE_KEY) ?? '';
      } catch {
        return this.memorySave;
      }
    }
    return this.memorySave;
  }

  async saveData(data: string): Promise<void> {
    this.log(`saveData(${data.length})`);
    this.memorySave = data;
    try {
      this.storage()?.setItem(STORAGE_KEY, data);
    } catch {
      /* private mode etc.; the memory copy still holds */
    }
  }

  isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void {
    this.audioListeners.add(cb);
    return () => this.audioListeners.delete(cb);
  }

  onPause(cb: () => void): () => void {
    this.pauseListeners.add(cb);
    return () => this.pauseListeners.delete(cb);
  }

  onResume(cb: () => void): () => void {
    this.resumeListeners.add(cb);
    return () => this.resumeListeners.delete(cb);
  }

  async sendScore(value: number): Promise<void> {
    this.lastScore = Math.floor(value);
    this.log(`sendScore(${Math.floor(value)})`);
  }

  async getLanguage(): Promise<string> {
    // Playables forbids web localization APIs (navigator.language); English is the default.
    return 'en';
  }

  logError(): void {
    this.log('logError');
  }

  logWarning(): void {
    this.log('logWarning');
  }
}
