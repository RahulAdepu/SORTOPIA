import type { PlatformAdapter } from './PlatformAdapter';
import { WebMockAdapter } from './WebMockAdapter';
import { YouTubePlayablesAdapter } from './YouTubePlayablesAdapter';

export type { PlatformAdapter } from './PlatformAdapter';

/** True when the official SDK script loaded and reports the Playables environment. */
export function isInPlayables(): boolean {
  return typeof ytgame !== 'undefined' && ytgame.IN_PLAYABLES_ENV === true;
}

let adapter: PlatformAdapter | null = null;

export function getPlatform(): PlatformAdapter {
  if (!adapter) adapter = isInPlayables() ? new YouTubePlayablesAdapter() : new WebMockAdapter();
  return adapter;
}

/** Test hook. */
export function setPlatform(p: PlatformAdapter): void {
  adapter = p;
}
