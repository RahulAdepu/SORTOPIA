/**
 * The only surface the game uses to talk to its host platform. Game code
 * never touches `ytgame` directly; see YouTubePlayablesAdapter.
 */
export interface PlatformAdapter {
  /** 'youtube' inside the Playables environment, 'web' everywhere else. */
  readonly kind: 'youtube' | 'web';
  firstFrameReady(): void;
  gameReady(): void;
  /** Resolves to the stored save string ('' when none). */
  loadData(): Promise<string>;
  saveData(data: string): Promise<void>;
  isAudioEnabled(): boolean;
  onAudioEnabledChange(cb: (enabled: boolean) => void): () => void;
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
  /** Integer score, highest is shown by YouTube. */
  sendScore(value: number): Promise<void>;
  getLanguage(): Promise<string>;
  logError(): void;
  logWarning(): void;
}
