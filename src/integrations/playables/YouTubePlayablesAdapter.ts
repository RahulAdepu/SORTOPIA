import type { PlatformAdapter } from './PlatformAdapter';

/**
 * Thin wrapper over the official `ytgame` SDK. Every call is guarded so an SDK
 * error can never crash the game (the docs note rejections may be undefined).
 */
export class YouTubePlayablesAdapter implements PlatformAdapter {
  readonly kind = 'youtube' as const;
  private firstFrameSent = false;
  private readySent = false;

  firstFrameReady(): void {
    if (this.firstFrameSent) return;
    this.firstFrameSent = true;
    try {
      ytgame.game.firstFrameReady();
    } catch (e) {
      console.warn('[playables] firstFrameReady failed', e);
    }
  }

  gameReady(): void {
    if (this.readySent) return;
    // The SDK requires firstFrameReady before gameReady.
    this.firstFrameReady();
    this.readySent = true;
    try {
      ytgame.game.gameReady();
    } catch (e) {
      console.warn('[playables] gameReady failed', e);
    }
  }

  async loadData(): Promise<string> {
    const data = await ytgame.game.loadData();
    return typeof data === 'string' ? data : '';
  }

  async saveData(data: string): Promise<void> {
    await ytgame.game.saveData(data);
  }

  isAudioEnabled(): boolean {
    try {
      return ytgame.system.isAudioEnabled();
    } catch {
      return true;
    }
  }

  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void {
    return ytgame.system.onAudioEnabledChange(cb);
  }

  onPause(cb: () => void): () => void {
    return ytgame.system.onPause(cb);
  }

  onResume(cb: () => void): () => void {
    return ytgame.system.onResume(cb);
  }

  async sendScore(value: number): Promise<void> {
    const v = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
    await ytgame.engagement.sendScore({ value: v });
  }

  async getLanguage(): Promise<string> {
    try {
      return await ytgame.system.getLanguage();
    } catch {
      return 'en';
    }
  }

  logError(): void {
    try {
      ytgame.health.logError();
    } catch {
      /* best effort */
    }
  }

  logWarning(): void {
    try {
      ytgame.health.logWarning();
    } catch {
      /* best effort */
    }
  }
}
