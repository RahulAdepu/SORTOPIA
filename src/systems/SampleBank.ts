/**
 * Loads and decodes the recorded sounds in /audio (relative to the page, as
 * Playables requires). Each file is fetched once; failures resolve to null so
 * callers can fall back to synthesis.
 */
export class SampleBank {
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  /** Start/end of the audible region per buffer (for gap-free music loops). */
  private regions = new Map<string, { start: number; end: number }>();

  constructor(private readonly ctx: AudioContext, private readonly base = 'audio/') {}

  get(name: string): AudioBuffer | undefined {
    return this.buffers.get(name);
  }

  region(name: string): { start: number; end: number } | undefined {
    return this.regions.get(name);
  }

  load(name: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(name);
    if (hit) return Promise.resolve(hit);
    const inflight = this.pending.get(name);
    if (inflight) return inflight;
    const p = fetch(`${this.base}${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
      .then((data) => this.decode(data))
      .then((buf) => {
        this.buffers.set(name, buf);
        this.regions.set(name, audibleRegion(buf));
        return buf;
      })
      .catch((e) => {
        console.warn(`[audio] ${name} unavailable, using fallback`, e);
        return null;
      })
      .finally(() => this.pending.delete(name));
    this.pending.set(name, p);
    return p;
  }

  preload(names: readonly string[]): Promise<void> {
    return Promise.all(names.map((n) => this.load(n))).then(() => undefined);
  }

  /** decodeAudioData in both promise and legacy callback forms (older Safari). */
  private decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      const p = this.ctx.decodeAudioData(data, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  }
}

/**
 * The non-silent span of a buffer. MP3 encoders pad the start and end with
 * silence, which would put an audible gap in a loop; looping between these
 * points removes it.
 */
export function audibleRegion(buf: AudioBuffer, threshold = 0.0015): { start: number; end: number } {
  const data = buf.getChannelData(0);
  let first = 0;
  while (first < data.length && Math.abs(data[first]) < threshold) first++;
  let last = data.length - 1;
  while (last > first && Math.abs(data[last]) < threshold) last--;
  return { start: first / buf.sampleRate, end: (last + 1) / buf.sampleRate };
}
