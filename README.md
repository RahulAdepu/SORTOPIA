# Sortopia: The Ultimate Color Sort Challenge

A liquid colour-sorting puzzle for **YouTube Playables** and the web, by **MindGrid Labs Pvt. Ltd.**
Built with Phaser 3, TypeScript and Vite. All artwork is drawn in code at runtime, so the game ships no image files. Audio is recorded CC0 (public domain) music and sound effects. The initial download is about 465 KiB gzipped; 3.7 MB of audio loads afterwards.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 97 unit/integration tests
npm run verify       # typecheck + tests + production build + Playables bundle check
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (the Playables SDK is a no-op locally; a mock adapter takes over) |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm test` | Vitest: engine, solver, all 100 levels, rewards, saves, hints, full journey |
| `npm run levels:generate` | Rebuild `src/data/levels/levels.json` (deterministic) |
| `npm run levels:validate` | Re-verify every shipped level independently |
| `npm run bundle:check` | Check `dist/` against Playables bundle rules |
| `npm run audio:build` | Rebuild `public/audio` from the CC0 sources in `scripts/audio-manifest.json` |
| `npm run verify` | Everything above, in CI order |

## Game overview

Tap a bottle to pick it up, then tap another to pour. Liquid may only be poured into an empty bottle or onto the same colour, and never beyond capacity. Sort every colour into its own bottle to win.

- **Classic**: 100 levels in 5 chapters, each adding something new:

  | Chapter | Levels | Colours | New idea |
  |---|---|---|---|
  | Crystal Lagoon | 1–10 | 3–4 | The basics, with a guided first level |
  | Candy Cove | 11–25 | 4–5 | Undo (11), Extra Bottle (11), hints (13) |
  | Lumen Grove | 26–50 | 5–7 | **Mystery layers** (30): "?" units reveal when they reach the top |
  | Amber Peaks | 51–75 | 7–9 | **Tall 5-layer bottles** (52) and move-limited levels |
  | Nebula Spire | 76–100 | 9–11 | **Frozen bottles** (76): unusable until a colour is fully sorted |

  Thirteen "breather" levels (marked with a leaf on the map) ease off after hard stretches. Each new mechanic gets a one-time explainer card.
- **Daily Challenge**: one puzzle per UTC day, identical for every player. It tracks streaks and pays more for longer streaks.
- **Time Challenge**: endless stages against the clock, with less time per pour as stages progress.
- **Limited Moves**: endless stages with a tight move budget.
- **Zen**: random relaxed puzzles with no timer and no limits.

**Rewards and the Shop.** Every currency has a use, and all of it is earned in play. There are no purchases and no ads.

- **Coins** come from levels, perfect solves, daily streaks, achievements, chapter chests and player level-ups (40 coins and a hint per level). They buy **bottle styles** (Frosted, Gilded, Neon Glow, Prism Crystal; 250–1000 coins) and boosts: the **Extra Bottle**, which adds an empty bottle mid-puzzle and caps that puzzle at 2 stars, and **Hint Packs**.
- **Stars** unlock **liquid palettes** (Pastel 45★, Jewel 120★, Neon 210★). Stars are never spent.
- 22 achievements, including Collector (own 3 bottle styles).

**Accessibility**: colour symbols (a unique shape per colour), reduced motion, larger text, separate Music and Sound FX volumes, haptics, and full keyboard play (`1`–`0` select bottles, `U` undo, `H` hint, `R` restart, `Esc` pause/close).

## Architecture

```
src/
  main.ts                    Phaser bootstrap, DPR-crisp rendering, resize, visibility guard
  config/                    Design tokens (theme.ts) and responsive layout units (layout.ts)
  scenes/                    Boot, Preload, Splash, MainMenu, LevelSelection, Game,
                             DailyChallenge, Achievements, Completion, GameOver, Pause, Settings
  systems/                   Pure game logic (no Phaser imports except GameManager/AudioManager):
    PuzzleEngine.ts          Rules, move validation, undo/restart/replay
    PuzzleSolver.ts          Weighted A* over canonical boards; verifies solutions
    PuzzleGenerator.ts       Seeded generator that only returns solver-verified puzzles
    HintSystem.ts            Next best pour, or how many undos escape a dead end
    ProgressManager.ts       Wins, unlocks, streaks, records, hint spending, level-up rewards
    ShopManager.ts           Buying/equipping styles and palettes, boosts
    HiddenLayers.ts          "?" mystery-layer tracking (reveals are permanent)
    RewardManager.ts         Stars, score, coins, XP formulas
    Achievements.ts          Achievement table and evaluation
    SaveManager.ts           Versioned, migration-safe save; debounced writes
    AudioManager.ts          Plays the recorded effects and music (mixing, crossfades, pause/mute gating)
    SampleBank.ts            Fetches and decodes audio files; finds gap-free loop points
    GameManager.ts           Services hub: platform lifecycle, saves, audio, haptics
  modes/GameModes.ts         Mode registry: add a mode by adding one object
  entities/
    Container.ts             The glass container (rendering, selection, completion)
    Liquid.ts                Liquid geometry: tilt-correct surfaces via polygon clipping
  ui/                        Drawn textures, components, chapter scenery, mode art, overlays, symbols
  integrations/playables/    PlatformAdapter + YouTube adapter + web/dev mock
  data/levels/               Level plan (chapters, mechanics, breathers), curated tutorial, levels.json
  data/catalog.ts            Bottle styles, liquid palettes, boosts
tests/                       Vitest suites
scripts/                     Level generation/validation and the bundle checker
deploy/nginx/                Production Nginx site
```

### Key design decisions

- **The engine owns the truth; animations only display it.** A pour is applied to `PuzzleEngine` immediately, and the visuals then catch up through per-container animation queues. Taps are never dropped during animations, and when taps arrive quickly the queued animations speed up (up to 3×) so the visuals don't lag behind.
- **Mechanics stay provable.** Frozen status is derived from how many bottles are complete, so it is a pure function of the board, and the solver and generator verify frozen levels under the real rules. Mystery layers only hide information, so solvability is unaffected.
- **Every puzzle is provably solvable.** The generator returns only boards whose solver solution replays to a win. The 100 levels ship with a stored, verified solution, and move limits are derived from it, so a limit is always at least that solution's length.
- **Realistic liquid.** Liquid volume is polygon area. For any tilt, the surface height is found by binary search, so layers stay horizontal while a bottle tilts, and the pour angle follows the remaining volume.
- **Fast, safe hints.** Solvability along a play history is monotonic, so the hint system binary-searches the history to tell a stuck player exactly how many moves to undo. The worst case measured on 13-bottle boards is about 15 ms.
- **Crisp at every size.** The canvas renders at device pixel ratio (capped at 2.5), and all art is drawn at its display resolution.

## YouTube Playables integration

The SDK is loaded by `<script src="https://www.youtube.com/game_api/v1">` in `index.html` **before** the game module. All SDK access goes through `src/integrations/playables/`:

| Requirement | Implementation |
|---|---|
| `firstFrameReady` | BootScene, on the first rendered frame |
| `gameReady` | MainMenu, once the menu is interactive (after the splash) |
| Cloud save | `SaveManager` awaits `loadData` before any `saveData`. Saves at level completion (immediately), during play (debounced) and on `onPause`. No other storage is used inside Playables |
| Older saves | `parseSave` migrates and sanitises any stored string and never throws |
| Pause / resume | `onPause` sleeps the game loop, suspends audio and flushes the save. `onResume` wakes it behind the Pause menu. The Page Visibility API is blocked (`installVisibilityGuard` in `main.ts`) and Phaser's blur/focus hooks are detached |
| Audio | `isAudioEnabled` is read at start and `onAudioEnabledChange` is honoured. The YouTube mute overrides everything, and there is no master mute button in-game |
| Score | `sendScore` with one dimension: the sum of best Classic level scores, which is stored in the save |
| Bundle | Relative paths (`base: './'`), valid file names and the size limits are checked by `npm run bundle:check` |

Outside Playables (local dev, or the standalone web build at games.mindgridlabs.org), `WebMockAdapter` stands in, using `localStorage` only in that context. In dev, the browser console exposes `sortopiaMock.pause()`, `.resume()`, `.setAudio(false)`, `.clearSave()` and `.calls` for lifecycle testing.

> **Certification status:** the integration follows the official SDK reference and certification requirements, and has been exercised against the mock. It has **not** yet been run in the Playables SDK Test Suite or the YouTube environment. Do that before submission (see `DEPLOYMENT.md`).

## Testing

`npm test` covers valid and invalid moves, capacity, matching colours, completed containers, puzzle completion, undo, restart and replay, hints (including dead-end recovery and a performance regression), generation and determinism, solvability of all 100 levels and of every mode, unlocking, rewards, streaks (including the UTC-midnight edge), achievements, save migration and size, and a full journey that plays all 100 levels through the same systems the game uses.

The browser journey (Splash → Menu → Level → pours → Completion → Next Level), plus undo, hint, pause/resume, resize-mid-game, Game Over and the accessibility toggles, was verified with a headless Chromium at phone (390×844) and desktop (1280×720) sizes. In dev builds, `window.__sortopia` exposes a small QA hook for this. It is stripped from production builds.

## Audio

Every sound is a recorded, CC0 (public domain) file. The source, author and licence of each file are listed in `scripts/audio-manifest.json`, and the credits ship in `public/audio/CREDITS.txt` and the in-game Credits panel.

| What | From |
|---|---|
| Music | MintoDog, "Cozy Puzzle" loops (menu, two in-game tracks); isaiah658, "Ambient Relaxing Loop" (Zen) |
| Glass taps, UI, chimes, swishes | Kenney, Interface Sounds |
| Win, lose and level-up jingles | Kenney, 85 Short Music Jingles (pizzicato set) |
| Pouring, splashes | rubberduck, 40 CC0 water/splash SFX |
| Bubbles, cork pop | BMacZero, Bubble Sound Effects; EZduzziteh, Pop sounds |

`npm run audio:build` downloads the sources, trims silence, normalises every effect to the same peak (measured after the mono downmix, so nothing clips), and encodes MP3 for iOS Safari compatibility. Effects load after the first tap. Music loads per screen and loops on its audible region, so the loop has no gap. If a file can't be fetched, a small built-in synthesiser stands in.

## Measured performance

These numbers come from headless Chromium with the CPU throttled 4×, playing the 13-bottle level 100 with continuous pours:

- Game work per frame: 3.7 ms mean, 4.8 ms p95, 6.2 ms worst, against a 16.7 ms budget for 60 fps.
- Hints: under 1 ms in play, 15 ms worst case in the stress test.
- JS heap: about 45 MB (the Playables limit is 512 MB).

Audio was verified by analysing the master bus. Every effect and every music track produces signal, and levels were balanced from those measurements. YouTube mute and platform pause both zero the master gain and suspend the context. An in-game volume of 0 is silent.

## Known limitations

- `phaser-*.js` is 1.4 MiB raw (332 KiB gzipped), above the Playables *SHOULD* guideline of 512 KiB per file. It is within the *MUST* limit (30 MiB). A custom Phaser build could reduce it.
- Not yet played by humans on real phones. Limited Moves and Time Challenge budgets were tuned by simulating imperfect players (noisy solver bots), not real playtests.
- UI text is English only. `getLanguage()` is read, but no translations ship yet.
- Outside Playables, the SDK `<script>` still downloads from youtube.com (via a redirect) before the game starts. This is required for the Playables bundle and is harmless on the web build.
