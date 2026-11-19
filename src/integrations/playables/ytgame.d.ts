/**
 * Type declarations for the YouTube Playables SDK global (`ytgame`).
 * Transcribed from the official reference only:
 * https://developers.google.com/youtube/gaming/playables/reference/sdk
 * Only the members this game uses are declared. Nothing is invented.
 */
declare namespace ytgame {
  const IN_PLAYABLES_ENV: boolean;
  const SDK_VERSION: string;

  enum SdkErrorType {
    API_UNAVAILABLE = 'API_UNAVAILABLE',
    INVALID_PARAMS = 'INVALID_PARAMS',
    SIZE_LIMIT_EXCEEDED = 'SIZE_LIMIT_EXCEEDED',
    UNKNOWN = 'UNKNOWN',
  }

  class SdkError extends Error {
    errorType: SdkErrorType;
  }

  namespace game {
    function firstFrameReady(): void;
    function gameReady(): void;
    function loadData(): Promise<string>;
    function saveData(data: string): Promise<void>;
  }

  namespace system {
    function isAudioEnabled(): boolean;
    function onAudioEnabledChange(callback: (isAudioEnabled: boolean) => void): () => void;
    function onPause(callback: () => void): () => void;
    function onResume(callback: () => void): () => void;
    function getLanguage(): Promise<string>;
  }

  namespace engagement {
    interface Score {
      value: number;
    }
    function sendScore(score: Score): Promise<void>;
  }

  namespace health {
    function logError(): void;
    function logWarning(): void;
  }
}
