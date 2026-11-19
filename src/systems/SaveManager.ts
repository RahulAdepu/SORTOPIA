import type { PlatformAdapter } from '../integrations/playables/PlatformAdapter';
import { defaultSave, SAVE_VERSION, type SaveData } from '../types/save';

/** Playables: saves MUST be < 3 MiB and SHOULD be < 500 KiB. We stay far below. */
export const SAVE_SOFT_LIMIT_BYTES = 500 * 1024;

function num(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Turn any stored string (including saves from older versions, partial or
 * corrupt data) into a valid SaveData. Never throws.
 */
export function parseSave(raw: string): SaveData {
  const base = defaultSave();
  if (!raw) return base;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!isObj(data)) return base;

  const out = base;
  out.coins = Math.floor(num(data.coins, base.coins));
  out.hints = Math.floor(num(data.hints, base.hints, 0, 999));
  out.xp = Math.floor(num(data.xp, 0));
  out.unlocked = Math.floor(num(data.unlocked, 1, 1, 100));
  out.bestTotalScore = Math.floor(num(data.bestTotalScore, 0));

  if (isObj(data.levels)) {
    for (const [k, v] of Object.entries(data.levels)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > 100 || !isObj(v)) continue;
      out.levels[String(id)] = {
        stars: Math.floor(num(v.stars, 0, 0, 3)),
        bestScore: Math.floor(num(v.bestScore, 0)),
        bestMoves: Math.floor(num(v.bestMoves, 0)),
        perfect: bool(v.perfect, false),
      };
    }
  }

  if (isObj(data.daily)) {
    const d = data.daily;
    out.daily.lastCompleted = typeof d.lastCompleted === 'string' ? d.lastCompleted : null;
    out.daily.streak = Math.floor(num(d.streak, 0));
    out.daily.bestStreak = Math.floor(num(d.bestStreak, 0));
    out.daily.totalCompleted = Math.floor(num(d.totalCompleted, 0));
    out.daily.history = Array.isArray(d.history) ? d.history.filter((x): x is string => typeof x === 'string').slice(-60) : [];
  }

  if (isObj(data.stats)) {
    const s = data.stats;
    for (const key of Object.keys(out.stats) as (keyof SaveData['stats'])[]) {
      out.stats[key] = Math.floor(num(s[key], 0));
    }
  }

  if (isObj(data.achievements)) {
    for (const [k, v] of Object.entries(data.achievements)) if (typeof v === 'number') out.achievements[k] = v;
  }
  if (Array.isArray(data.milestones)) out.milestones = data.milestones.filter((x): x is number => typeof x === 'number');

  if (isObj(data.settings)) {
    const s = data.settings;
    out.settings.music = num(s.music, out.settings.music, 0, 1);
    out.settings.sfx = num(s.sfx, out.settings.sfx, 0, 1);
    out.settings.haptics = bool(s.haptics, out.settings.haptics);
    out.settings.colorSymbols = bool(s.colorSymbols, out.settings.colorSymbols);
    out.settings.reducedMotion = bool(s.reducedMotion, out.settings.reducedMotion);
    out.settings.largeText = bool(s.largeText, out.settings.largeText);
  }

  if (isObj(data.inProgress)) {
    const p = data.inProgress;
    const history = Array.isArray(p.history)
      ? p.history.filter((m): m is [number, number] => Array.isArray(m) && m.length === 2 && m.every((x) => Number.isInteger(x)))
      : [];
    const level = Math.floor(num(p.level, 0));
    if (level >= 1 && level <= 100) {
      out.inProgress = {
        level,
        history,
        moves: Math.floor(num(p.moves, history.length)),
        extra: Math.floor(num(p.extra, 0, 0, 3)),
        hintsUsed: Math.floor(num(p.hintsUsed, 0)),
        undosUsed: Math.floor(num(p.undosUsed, 0)),
      };
    }
  }

  if (isObj(data.seen)) {
    for (const [k, v] of Object.entries(data.seen)) if (typeof v === 'boolean') out.seen[k] = v;
  }

  if (isObj(data.cosmetics)) {
    const c = data.cosmetics;
    if (Array.isArray(c.owned)) {
      for (const id of c.owned) if (typeof id === 'string' && !out.cosmetics.owned.includes(id)) out.cosmetics.owned.push(id);
    }
    if (typeof c.bottle === 'string' && out.cosmetics.owned.includes(`bottle:${c.bottle}`)) out.cosmetics.bottle = c.bottle;
    if (typeof c.palette === 'string' && out.cosmetics.owned.includes(`palette:${c.palette}`)) out.cosmetics.palette = c.palette;
  }
  if (isObj(data.items)) out.items.extraBottles = Math.floor(num(data.items.extraBottles, out.items.extraBottles, 0, 99));

  // Keep the reported score consistent with the save: never below the sum of level bests.
  const sum = Object.values(out.levels).reduce((a, l) => a + l.bestScore, 0);
  out.bestTotalScore = Math.max(out.bestTotalScore, sum);
  out.version = SAVE_VERSION;
  return out;
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}

/**
 * Loads once, then coalesces writes. Playables rule: loadData MUST be awaited
 * before any saveData call: `save()` is a no-op until `load()` has finished.
 */
export class SaveManager {
  private loaded = false;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> = Promise.resolve();
  data: SaveData = defaultSave();

  constructor(private readonly platform: PlatformAdapter) {}

  get isLoaded(): boolean {
    return this.loaded;
  }

  async load(): Promise<SaveData> {
    try {
      const raw = await this.platform.loadData();
      this.data = parseSave(raw);
    } catch (e) {
      console.warn('[save] load failed, starting fresh', e);
      this.platform.logWarning();
      this.data = defaultSave();
    }
    this.loaded = true;
    return this.data;
  }

  /** Schedule a save shortly (coalesces bursts of changes). */
  save(delayMs = 400): void {
    if (!this.loaded) return;
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      this.pending = null;
      void this.flush();
    }, delayMs);
  }

  /** Write immediately. Used at milestones (level complete) and on pause. */
  flush(): Promise<void> {
    if (!this.loaded) return Promise.resolve();
    if (this.pending) {
      clearTimeout(this.pending);
      this.pending = null;
    }
    const payload = serializeSave(this.data);
    const wellFormed = (payload as unknown as { isWellFormed?: () => boolean }).isWellFormed?.() ?? true;
    if (!wellFormed || payload.length * 2 > SAVE_SOFT_LIMIT_BYTES) {
      console.warn('[save] payload rejected', payload.length);
      this.platform.logWarning();
      return this.inFlight;
    }
    this.inFlight = this.inFlight
      .then(() => this.platform.saveData(payload))
      .catch((e) => {
        console.warn('[save] saveData failed', e);
        this.platform.logWarning();
      });
    return this.inFlight;
  }
}
