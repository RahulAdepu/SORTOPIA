/**
 * Validates dist/ against the YouTube Playables bundle requirements:
 *  - index.html at the root; the SDK <script> appears before any game code
 *  - only relative paths (no "/" or "//host" asset references)
 *  - file names use only [A-Za-z0-9_.-]
 *  - ≤ 8000 files; every file < 30 MiB (SHOULD < 512 KiB); total < 250 MiB
 *  - reports the gzip size of the initial load (MUST < 30 MiB, SHOULD < 15 MiB)
 *
 *   npm run bundle:check
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = resolve(process.argv[2] ?? 'dist');
const MiB = 1024 * 1024;
const errors: string[] = [];
const warnings: string[] = [];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dist);
let total = 0;
let gzTotal = 0;
let lazyTotal = 0;
for (const f of files) {
  const size = statSync(f).size;
  total += size;
  const name = basename(f);
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) errors.push(`Invalid file name: ${relative(dist, f)}`);
  if (size >= 30 * MiB) errors.push(`File ≥ 30 MiB: ${relative(dist, f)}`);
  else if (size >= 512 * 1024) warnings.push(`File > 512 KiB (SHOULD be smaller): ${relative(dist, f)}: ${(size / 1024).toFixed(0)} KiB raw, ${(gzipSync(readFileSync(f)).length / 1024).toFixed(0)} KiB gzip`);
  // Only woff2 fonts are fetched by modern browsers; the legacy .woff copies are never downloaded.
  // Audio is fetched after the first tap (effects) or per screen (music), so it is not initial load.
  if (relative(dist, f).split(sep).join('/').startsWith('audio/')) lazyTotal += size;
  else if (!f.endsWith('.woff')) gzTotal += gzipSync(readFileSync(f)).length;
}
if (files.length > 8000) errors.push(`Too many files: ${files.length} (max 8000)`);
if (total >= 250 * MiB) errors.push(`Total bundle ≥ 250 MiB: ${(total / MiB).toFixed(1)} MiB`);

const indexPath = join(dist, 'index.html');
let html = '';
try {
  html = readFileSync(indexPath, 'utf8');
} catch {
  errors.push('dist/index.html missing');
}
if (html) {
  const sdk = html.indexOf('https://www.youtube.com/game_api/v1');
  const firstModule = html.search(/<script[^>]+type="module"/);
  if (sdk < 0) errors.push('Playables SDK script tag missing');
  else if (firstModule >= 0 && firstModule < sdk) errors.push('Game script loads before the Playables SDK');
  const absolute = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  if (absolute.length) errors.push(`Absolute paths in index.html: ${absolute.join(', ')}`);
}
for (const f of files.filter((p) => p.endsWith('.css'))) {
  const css = readFileSync(f, 'utf8');
  if (/url\(\s*["']?\/(?!\/)/.test(css)) errors.push(`Absolute url() in ${relative(dist, f)}`);
}

console.log(`Files: ${files.length}   Raw: ${(total / 1024).toFixed(0)} KiB   Initial (gzip, woff2 only): ${(gzTotal / 1024).toFixed(0)} KiB   Lazy audio: ${(lazyTotal / 1024).toFixed(0)} KiB`);
warnings.forEach((w) => console.log(`WARN  ${w}`));
errors.forEach((e) => console.error(`ERROR ${e}`));
if (gzTotal >= 15 * MiB) warnings.push('Initial bundle ≥ 15 MiB (SHOULD be smaller)');
if (errors.length) {
  console.error(`\nBundle check FAILED (${errors.length} error(s)).`);
  process.exit(1);
}
console.log('\nBundle check passed.');
