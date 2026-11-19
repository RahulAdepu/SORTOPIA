/**
 * Builds public/audio/*.mp3 from the CC0 sources listed in audio-manifest.json.
 *
 *   npm run audio:build
 *
 * Downloads each source once into .cache/audio-src, then with ffmpeg:
 *   sound effects  trim leading/trailing silence, peak-normalise to -1 dBFS,
 *                  10 ms fade-out, mono 44.1 kHz MP3 (96 kb/s)
 *   loops          as above but without trimming the tail
 *   music          loudness-normalised to -18 LUFS, stereo 44.1 kHz MP3 (80 kb/s)
 * MP3 is used because every browser YouTube supports (including iOS Safari)
 * decodes it with Web Audio. Writes public/audio/CREDITS.txt.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import ffmpeg from 'ffmpeg-static';
import { inflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'scripts/audio-manifest.json'), 'utf8'));
const cache = join(root, '.cache/audio-src');
const out = join(root, 'public/audio');
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });

async function fetchSource(id) {
  const src = manifest.sources[id];
  const name = src.url.split('/').pop();
  const file = join(cache, id, name);
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    console.log(`downloading ${src.url}`);
    const res = await fetch(src.url, { headers: { 'User-Agent': 'sortopia-audio-build' } });
    if (!res.ok) throw new Error(`${res.status} ${src.url}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
  }
  if (name.endsWith('.zip')) {
    const dir = file.replace(/\.zip$/, '');
    if (!existsSync(dir)) unzip(file, dir);
    return dir;
  }
  return file;
}

/**
 * Minimal, dependency-free zip extraction (stored + deflate entries) using the
 * central directory. Only audio and licence files are written, and entry paths
 * are confined to the destination folder.
 */
function unzip(zip, dir) {
  const buf = readFileSync(zip);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error(`not a zip: ${zip}`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || !/\.(ogg|wav|mp3|txt)$/i.test(name)) continue;
    const target = resolve(dir, name);
    if (!target.startsWith(resolve(dir))) continue;
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + size);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, method === 8 ? inflateRawSync(raw) : raw);
  }
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      const hit = findFile(p, name);
      if (hit) return hit;
    } else if (entry === name) {
      return p;
    }
  }
  return null;
}

function encodeSfx(input, output, loop) {
  // Downmix to mono FIRST: summing stereo channels can exceed the source peak,
  // so the peak must be measured on the signal that is actually encoded.
  const mono = 'aformat=sample_fmts=flt:channel_layouts=mono';
  const trim = loop
    ? `${mono},silenceremove=start_periods=1:start_threshold=-50dB`
    : `${mono},silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse`;
  // Measure the true (float) peak after trimming, then normalise to -1.5 dBFS,
  // leaving headroom for MP3 overshoot. astats reads float samples, so sources
  // that exceed 0 dBFS are measured correctly (volumedetect clips them first).
  const stderr = spawnStderr(['-hide_banner', '-nostats', '-i', input, '-af', `${trim},astats=measure_perchannel=none`, '-f', 'null', '-']);
  const m = /Peak level dB:\s*(-?[\d.]+)/.exec(stderr);
  const gain = m ? -1.5 - Number(m[1]) : 0;
  const fade = loop ? '' : ',areverse,afade=t=in:d=0.01,areverse';
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-af', `${trim},volume=${gain.toFixed(2)}dB${fade}`, '-ac', '1', '-ar', '44100', '-b:a', '96k', output]);
}

function encodeMusic(input, output) {
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11', '-ac', '2', '-ar', '44100', '-b:a', '80k', output]);
}

function spawnStderr(args) {
  return spawnSync(ffmpeg, args, { encoding: 'utf8' }).stderr ?? '';
}

const credits = new Map();
for (const [name, def] of Object.entries(manifest.sfx)) {
  const base = await fetchSource(def.source);
  const input = statSync(base).isDirectory() ? findFile(base, def.file) : base;
  if (!input) throw new Error(`${def.file} not found in ${def.source}`);
  encodeSfx(input, join(out, `${name}.mp3`), !!def.loop);
  credits.set(def.source, (credits.get(def.source) ?? []).concat(name));
  console.log(`sfx   ${name.padEnd(10)} ← ${def.file}`);
}
for (const [name, def] of Object.entries(manifest.music)) {
  const input = await fetchSource(def.source);
  encodeMusic(input, join(out, `${name}.mp3`));
  credits.set(def.source, (credits.get(def.source) ?? []).concat(name));
  console.log(`music ${name.padEnd(12)} ← ${def.source}`);
}

const lines = ['Sortopia audio credits', '', 'All audio is CC0 (public domain). Credit is not required but is given with thanks.', ''];
for (const [id, used] of credits) {
  const s = manifest.sources[id];
  lines.push(`${s.author}  [${s.license}]`, `  ${s.page}`, `  used for: ${used.join(', ')}`, '');
}
writeFileSync(join(out, 'CREDITS.txt'), lines.join('\n'));
const total = readdirSync(out).filter((f) => f.endsWith('.mp3')).reduce((a, f) => a + statSync(join(out, f)).size, 0);
console.log(`\n${readdirSync(out).filter((f) => f.endsWith('.mp3')).length} files, ${(total / 1024).toFixed(0)} KiB in public/audio`);
