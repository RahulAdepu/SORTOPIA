import { SampleBank } from './SampleBank';

/**
 * Game audio. Sound effects and music are recorded CC0 samples (see
 * public/audio/CREDITS.txt) played through the Web Audio API. If a file cannot
 * be fetched or decoded, a small synthesiser stands in so the game is never silent.
 *
 * Output is gated by three things, all of which must allow sound:
 *  1. The platform audio setting (YouTube mute): a hard gate that, overrides everything.
 *  2. The platform pause lifecycle (onPause/onResume).
 *  3. The player's in-game Music / SFX volume preferences.
 */
export type SfxName =
  | 'select'
  | 'deselect'
  | 'pour'
  | 'land'
  | 'complete'
  | 'invalid'
  | 'undo'
  | 'win'
  | 'star'
  | 'coin'
  | 'click'
  | 'hint'
  | 'lose'
  | 'pop'
  | 'whoosh'
  | 'reveal'
  | 'levelup'
  | 'toggle';

/** One-shot samples preloaded after the first tap (about 100 KB in total). */
const SFX_FILES = ['select', 'deselect', 'click', 'toggle', 'invalid', 'complete', 'star', 'whoosh', 'undo', 'hint', 'reveal', 'coin', 'land', 'drip', 'pop', 'bubble', 'stream', 'glug', 'win', 'levelup', 'lose'] as const;

/** Music per theme; game alternates between two tracks. Loaded lazily. */
const MUSIC_FILES: Record<'menu' | 'game' | 'zen', string[]> = {
  menu: ['music-menu'],
  game: ['music-game-a', 'music-game-b'],
  zen: ['music-zen'],
};

/** Mix level per recorded sound (0..1), balanced from measured output loudness. */
const MIX: Record<string, number> = {
  select: 0.55,
  deselect: 0.75,
  click: 0.7,
  toggle: 0.5,
  invalid: 0.45,
  complete: 0.42,
  star: 0.42,
  whoosh: 0.75,
  undo: 0.6,
  hint: 0.3,
  reveal: 0.85,
  coin: 0.35,
  land: 0.45,
  drip: 0.3,
  pop: 0.85,
  bubble: 0.25,
  stream: 0.4,
  glug: 0.3,
  win: 0.5,
  levelup: 0.4,
  lose: 0.42,
};

export type MusicTheme = 'menu' | 'game' | 'zen';

const NOTE = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Chord progressions as MIDI notes (bass first). */
const PROGRESSIONS: Record<MusicTheme, number[][]> = {
  // Dbmaj7 – Bbm7 – Gbmaj7 – Ab6 : warm, hopeful
  menu: [
    [49, 61, 65, 68, 72],
    [46, 61, 65, 68, 70],
    [42, 61, 65, 66, 70],
    [44, 60, 63, 65, 68],
  ],
  // Fmaj9 – Dm9 – Bbmaj7 – C6/9 : light, focused
  game: [
    [41, 60, 64, 67, 69],
    [38, 60, 62, 65, 69],
    [46, 62, 65, 69, 70],
    [48, 62, 64, 67, 69],
  ],
  // Ebmaj7 – Abmaj7 (slow) : spacious
  zen: [
    [39, 58, 62, 63, 67],
    [44, 60, 63, 67, 68],
    [39, 58, 62, 65, 67],
    [41, 60, 63, 65, 70],
  ],
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private delay: DelayNode | null = null;
  private noise: AudioBuffer | null = null;
  private platformEnabled = true;
  private paused = false;
  private musicVolume = 0.6;
  private sfxVolume = 0.85;
  private theme: MusicTheme | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private nextBarTime = 0;
  private barIndex = 0;
  private seed = 1;
  private samples: SampleBank | null = null;
  private track: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicVariant = 0;
  private usingSynthMusic = false;

  /** Must be called from a user gesture (browsers block audio before one). */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      // Gentle echo for music & sparkle effects.
      this.delay = this.ctx.createDelay(1);
      this.delay.delayTime.value = 0.33;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.28;
      const wet = this.ctx.createGain();
      wet.gain.value = 0.22;
      this.delay.connect(fb).connect(this.delay);
      this.delay.connect(wet).connect(this.master);
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.noise = this.makeNoise();
      this.applyGains();
      this.samples = new SampleBank(this.ctx);
      void this.samples.preload(SFX_FILES);
    }
    if (this.canSound() && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    if (this.theme && !this.track && !this.schedulerTimer) this.startMusicNow();
  }

  get unlocked(): boolean {
    return !!this.ctx;
  }

  setPlatformAudio(enabled: boolean): void {
    this.platformEnabled = enabled;
    this.applyGains();
    this.syncContextState();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.syncContextState();
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyGains();
  }

  private canSound(): boolean {
    return this.platformEnabled && !this.paused;
  }

  private syncContextState(): void {
    if (!this.ctx) return;
    if (this.canSound()) void this.ctx.resume().catch(() => undefined);
    else void this.ctx.suspend().catch(() => undefined);
  }

  private applyGains(): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    // Mute must be immediate and must not depend on the context running (a
    // suspended context freezes ramps), so set the master value directly.
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.value = this.platformEnabled ? 1 : 0;
    this.musicBus.gain.setTargetAtTime(this.musicVolume * (this.usingSynthMusic ? 0.32 : 0.5), t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume * 0.9, t, 0.02);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  // ---------------------------------------------------------------- voices

  private tone(
    freq: number,
    start: number,
    dur: number,
    opts: { type?: OscillatorType; gain?: number; attack?: number; endFreq?: number; bus?: AudioNode; detune?: number; send?: number } = {},
  ): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, start + dur);
    if (opts.detune) osc.detune.value = opts.detune;
    const peak = opts.gain ?? 0.2;
    const attack = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(opts.bus ?? (this.sfxBus as GainNode));
    if (opts.send && this.delay) {
      const s = ctx.createGain();
      // The echo bypasses the buses, so scale it by the matching volume preference.
      const busVolume = opts.bus === this.musicBus ? this.musicVolume * 0.32 : this.sfxVolume * 0.9;
      s.gain.value = opts.send * busVolume;
      g.connect(s).connect(this.delay);
    }
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private noiseBurst(start: number, dur: number, opts: { freq?: number; endFreq?: number; q?: number; gain?: number; type?: BiquadFilterType } = {}): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, start);
    if (opts.endFreq) f.frequency.exponentialRampToValueAtTime(opts.endFreq, start + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, start + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(this.sfxBus as GainNode);
    src.start(start, this.rand() * 0.5);
    src.stop(start + dur + 0.05);
  }

  /** Play a sound effect. `pitch` shifts by semitones; `duration` is used by 'pour'. */
  play(name: SfxName, opts: { pitch?: number; duration?: number; index?: number } = {}): void {
    if (!this.ctx || !this.canSound() || this.sfxVolume <= 0) return;
    if (this.playRecorded(name, opts)) return;
    const t = this.ctx.currentTime + 0.005;
    const p = Math.pow(2, (opts.pitch ?? 0) / 12);
    switch (name) {
      case 'select':
        this.tone(1318 * p, t, 0.16, { gain: 0.16 });
        this.tone(2637 * p, t, 0.1, { gain: 0.06 });
        break;
      case 'deselect':
        this.tone(988 * p, t, 0.1, { gain: 0.1 });
        break;
      case 'click':
        this.tone(880, t, 0.05, { type: 'triangle', gain: 0.12 });
        this.tone(1760, t, 0.03, { gain: 0.05 });
        break;
      case 'pour': {
        const dur = opts.duration ?? 0.5;
        this.noiseBurst(t, dur + 0.1, { freq: 700, endFreq: 1100, q: 0.8, gain: 0.05 });
        let x = t + 0.02;
        while (x < t + dur) {
          const f = 260 + this.rand() * 260;
          this.tone(f * p, x, 0.07, { gain: 0.09 + this.rand() * 0.05, endFreq: f * 1.9 * p, attack: 0.008 });
          x += 0.055 + this.rand() * 0.05;
        }
        break;
      }
      case 'land':
        this.tone(190, t, 0.16, { gain: 0.16, endFreq: 95 });
        this.noiseBurst(t, 0.06, { freq: 1800, gain: 0.03 });
        break;
      case 'complete':
        [0, 4, 7, 12].forEach((s, i) => this.tone(NOTE(84 + s) * p, t + i * 0.065, 0.45, { gain: 0.1, send: 0.5 }));
        this.tone(NOTE(96) * p, t + 0.26, 0.6, { gain: 0.05, type: 'triangle', send: 0.6 });
        break;
      case 'pop':
        this.noiseBurst(t, 0.05, { freq: 2500, gain: 0.08, q: 2 });
        this.tone(500, t, 0.09, { gain: 0.12, endFreq: 950 });
        break;
      case 'invalid':
        this.tone(233, t, 0.1, { type: 'triangle', gain: 0.16 });
        this.tone(207, t + 0.09, 0.14, { type: 'triangle', gain: 0.14 });
        break;
      case 'undo':
        this.noiseBurst(t, 0.2, { freq: 2400, endFreq: 500, q: 1.5, gain: 0.06 });
        this.tone(740, t, 0.16, { gain: 0.08, endFreq: 440 });
        break;
      case 'reveal':
        this.tone(1568 * p, t, 0.12, { gain: 0.1, type: 'triangle' });
        break;
      case 'levelup':
        [72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), t + i * 0.08, 0.4, { gain: 0.1, send: 0.4 }));
        break;
      case 'toggle':
        this.tone(1200, t, 0.05, { type: 'triangle', gain: 0.1 });
        break;
      case 'whoosh':
        this.noiseBurst(t, 0.28, { freq: 500, endFreq: 2600, q: 0.45, gain: 0.16 });
        this.tone(220, t, 0.22, { gain: 0.04, endFreq: 520 });
        break;
      case 'hint':
        this.tone(784, t, 0.35, { gain: 0.09, endFreq: 1568, send: 0.6 });
        this.tone(1175, t + 0.08, 0.3, { gain: 0.05, send: 0.6 });
        break;
      case 'star': {
        const i = opts.index ?? 0;
        const base = [76, 79, 84][Math.min(2, i)];
        this.tone(NOTE(base), t, 0.6, { gain: 0.12, send: 0.5 });
        this.tone(NOTE(base + 12), t, 0.4, { gain: 0.05, type: 'triangle', send: 0.5 });
        break;
      }
      case 'coin':
        this.tone(1568, t, 0.08, { gain: 0.08, type: 'square' as OscillatorType });
        this.tone(2093, t + 0.06, 0.22, { gain: 0.07, send: 0.3 });
        break;
      case 'win': {
        const seq = [72, 76, 79, 84, 88];
        seq.forEach((n, i) => this.tone(NOTE(n), t + i * 0.09, 0.5, { gain: 0.11, send: 0.4 }));
        [60, 64, 67, 72].forEach((n) => this.tone(NOTE(n), t + 0.45, 1.4, { type: 'triangle', gain: 0.06, attack: 0.05, send: 0.4 }));
        break;
      }
      case 'lose':
        [67, 63, 60].forEach((n, i) => this.tone(NOTE(n), t + i * 0.16, 0.4, { type: 'triangle', gain: 0.12 }));
        break;
    }
  }

  // ---------------------------------------------------------------- music

  // ------------------------------------------------------- recorded samples

  /** Small random variation so repeated sounds never feel machine-identical. */
  private jitter(amount: number): number {
    return 1 + (this.rand() * 2 - 1) * amount;
  }

  private shot(name: string, opts: { rate?: number; gain?: number; when?: number; offset?: number; duration?: number; fadeIn?: number; fadeOut?: number } = {}): boolean {
    const buf = this.samples?.get(name);
    const ctx = this.ctx;
    if (!buf || !ctx || !this.sfxBus) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    const when = opts.when ?? ctx.currentTime;
    const level = (MIX[name] ?? 0.5) * (opts.gain ?? 1);
    if (opts.fadeIn) {
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(level, when + opts.fadeIn);
    } else {
      g.gain.setValueAtTime(level, when);
    }
    src.connect(g).connect(this.sfxBus);
    if (opts.duration !== undefined) {
      const out = opts.fadeOut ?? 0.08;
      const end = when + opts.duration;
      g.gain.setValueAtTime(level, Math.max(when + (opts.fadeIn ?? 0), end - out));
      g.gain.linearRampToValueAtTime(0.0001, end);
      src.loop = true;
      src.start(when, opts.offset ?? 0);
      src.stop(end + 0.02);
    } else {
      src.start(when, opts.offset ?? 0);
    }
    return true;
  }

  /** Play a recorded effect. Returns false when the sample is not loaded yet. */
  private playRecorded(name: SfxName, opts: { pitch?: number; duration?: number; index?: number }): boolean {
    const ctx = this.ctx as AudioContext;
    const semis = Math.pow(2, (opts.pitch ?? 0) / 12);
    switch (name) {
      case 'pour': {
        const dur = Math.max(0.25, opts.duration ?? 0.6);
        const stream = this.samples?.get('stream');
        if (!stream) return false;
        // Steady stream + glugging + a few bubbles rising in the receiving bottle.
        this.shot('stream', { duration: dur, offset: this.rand() * Math.max(0, stream.duration - dur - 0.1), fadeIn: 0.06, fadeOut: 0.15, rate: this.jitter(0.04) });
        this.shot('glug', { duration: dur * 0.9, when: ctx.currentTime + 0.08, offset: this.rand() * 2, fadeIn: 0.1, fadeOut: 0.2, rate: this.jitter(0.08) });
        const bubbles = Math.max(1, Math.round(dur * 3));
        for (let i = 0; i < bubbles; i++) {
          this.shot('bubble', { when: ctx.currentTime + 0.15 + this.rand() * dur, rate: 0.85 + this.rand() * 0.5, gain: 0.6 + this.rand() * 0.4 });
        }
        return true;
      }
      case 'land':
        if (!this.shot('land', { rate: this.jitter(0.06) })) return false;
        this.shot('drip', { rate: this.jitter(0.1), when: ctx.currentTime + 0.03 });
        return true;
      case 'select':
        return this.shot('select', { rate: semis * this.jitter(0.02) });
      case 'star': {
        const steps = [0, 3, 7];
        return this.shot('star', { rate: Math.pow(2, (steps[Math.min(2, opts.index ?? 0)] ?? 0) / 12) });
      }
      case 'coin':
        return this.shot('coin', { rate: this.jitter(0.05) });
      case 'click':
      case 'deselect':
      case 'toggle':
      case 'invalid':
      case 'undo':
      case 'whoosh':
      case 'hint':
      case 'reveal':
      case 'pop':
      case 'complete':
        return this.shot(name, { rate: this.jitter(0.03), gain: this.jitter(0.06) });
      case 'win':
      case 'lose':
      case 'levelup':
        return this.shot(name);
    }
    return false;
  }

  // ------------------------------------------------------------ music

  /** `variant` picks between tracks of a theme (e.g. level parity for game music). */
  playMusic(theme: MusicTheme, variant = 0): void {
    const changed = this.theme !== theme || (theme === 'game' && variant !== this.musicVariant);
    this.theme = theme;
    this.musicVariant = variant;
    if (!changed && (this.track || this.schedulerTimer)) return;
    if (this.ctx) this.startMusicNow();
  }

  private startMusicNow(): void {
    const theme = this.theme;
    if (!theme || !this.ctx || !this.samples) return;
    const list = MUSIC_FILES[theme];
    const name = list[this.musicVariant % list.length];
    if (this.track?.name === name) return;
    void this.samples.load(name).then((buf) => {
      if (this.theme !== theme || !this.ctx) return;
      if (!buf) {
        this.fallbackToSynth();
        return;
      }
      this.stopSynthMusic();
      this.crossfadeTo(name, buf);
    });
  }

  private crossfadeTo(name: string, buf: AudioBuffer): void {
    const ctx = this.ctx as AudioContext;
    if (this.track?.name === name) return;
    const t = ctx.currentTime;
    if (this.track) {
      const old = this.track;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0.0001, t + 1.2);
      old.src.stop(t + 1.3);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const region = this.samples?.region(name);
    if (region && region.end - region.start > 1) {
      src.loopStart = region.start;
      src.loopEnd = region.end;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 1.5);
    src.connect(g).connect(this.musicBus as GainNode);
    src.start(t, region?.start ?? 0);
    this.track = { name, src, gain: g };
    if (this.usingSynthMusic) {
      this.usingSynthMusic = false;
      this.applyGains();
    }
  }

  private fallbackToSynth(): void {
    if (this.schedulerTimer || !this.ctx) return;
    this.usingSynthMusic = true;
    this.applyGains();
    this.nextBarTime = this.ctx.currentTime + 0.1;
    this.startScheduler();
  }

  private stopSynthMusic(): void {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
  }

  stopMusic(): void {
    this.theme = null;
    this.stopSynthMusic();
    if (this.track && this.ctx) {
      const t = this.ctx.currentTime;
      this.track.gain.gain.cancelScheduledValues(t);
      this.track.gain.gain.setValueAtTime(this.track.gain.gain.value, t);
      this.track.gain.gain.linearRampToValueAtTime(0.0001, t + 0.6);
      this.track.src.stop(t + 0.7);
    }
    this.track = null;
  }

  private startScheduler(): void {
    if (!this.ctx) return;
    this.nextBarTime = Math.max(this.nextBarTime, this.ctx.currentTime + 0.1);
    this.schedulerTimer = setInterval(() => this.schedule(), 200);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.theme || ctx.state !== 'running') return;
    // Skip ahead rather than burst-scheduling after a long suspension.
    if (this.nextBarTime < ctx.currentTime - 0.5) this.nextBarTime = ctx.currentTime + 0.05;
    while (this.nextBarTime < ctx.currentTime + 1.2) {
      this.scheduleBar(this.nextBarTime);
      const bpm = this.theme === 'zen' ? 60 : this.theme === 'menu' ? 76 : 84;
      this.nextBarTime += (60 / bpm) * 4;
      this.barIndex++;
    }
  }

  private scheduleBar(t: number): void {
    if (!this.theme || this.musicVolume <= 0) return;
    const bus = this.musicBus as GainNode;
    const prog = PROGRESSIONS[this.theme];
    const chord = prog[this.barIndex % prog.length];
    const bpm = this.theme === 'zen' ? 60 : this.theme === 'menu' ? 76 : 84;
    const beat = 60 / bpm;
    const bar = beat * 4;
    // Pad
    for (let i = 1; i < chord.length; i++) {
      const f = NOTE(chord[i]);
      this.tone(f, t, bar * 1.05, { type: 'triangle', gain: 0.035, attack: bar * 0.35, bus, detune: -6 });
      this.tone(f, t, bar * 1.05, { type: 'sine', gain: 0.03, attack: bar * 0.4, bus, detune: 7 });
    }
    // Bass
    this.tone(NOTE(chord[0]), t, bar * 0.9, { type: 'sine', gain: 0.09, attack: 0.08, bus });
    // Arpeggio (sparse in zen)
    const steps = this.theme === 'zen' ? 4 : 8;
    const stepDur = bar / steps;
    for (let s = 0; s < steps; s++) {
      if (this.rand() < (this.theme === 'zen' ? 0.45 : 0.3)) continue;
      const note = chord[1 + Math.floor(this.rand() * (chord.length - 1))] + 12;
      this.tone(NOTE(note), t + s * stepDur, stepDur * 2.2, { type: 'sine', gain: 0.045, bus, send: 0.5 });
    }
  }
}
