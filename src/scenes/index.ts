import { AchievementsScene } from './AchievementsScene';
import { BootScene } from './BootScene';
import { CompletionScene } from './CompletionScene';
import { DailyChallengeScene } from './DailyChallengeScene';
import { GameOverScene } from './GameOverScene';
import { GameScene } from './GameScene';
import { LevelSelectionScene } from './LevelSelectionScene';
import { MainMenuScene } from './MainMenuScene';
import { PauseScene } from './PauseScene';
import { PreloadScene } from './PreloadScene';
import { SettingsScene } from './SettingsScene';
import { ShopScene } from './ShopScene';
import { SplashScene } from './SplashScene';

/** Order matters: later scenes render on top (overlays last). */
export const SCENES = [
  BootScene,
  PreloadScene,
  SplashScene,
  MainMenuScene,
  LevelSelectionScene,
  GameScene,
  DailyChallengeScene,
  AchievementsScene,
  ShopScene,
  CompletionScene,
  GameOverScene,
  PauseScene,
  SettingsScene,
];
