/**
 * Mirror namazvakti.com's yearly tables into Mihrab's repo (October 2026:
 * every table the app serves comes from the repo, the site only as a backup
 * — docs/prayer-times-sources.md).
 *
 * ── WHERE IT GOES ─────────────────────────────────────────────────────
 *
 * Every city the index (`build.ts`) has located and the site has times for,
 * packed (`src/providers/namazvaktiPack.ts`, about 460 bytes a city
 * gzipped), spread over 512 gzipped JSON files by city id
 * (`namazvaktiBucketAsset`), plus `index.json`. About 120,000 cities are some 55 MB a year — too much
 * for git history and the raw CDN, so the files are assets of this
 * repository's `data-namazvakti-<year>` release (the workflow downloads the
 * current ones, this script updates them in place, the workflow uploads the
 * ones it changed). The phone downloads its city's file, once a year.
 *
 * ── HOW IT RUNS ───────────────────────────────────────────────────────
 *
 * Incremental and resumable, like the index: each run reads, politely and
 * within its budget, first the cities the mirror does not have for the year
 * yet, then the ones read longest ago (the site corrects its tables now and
 * then), and writes every file it touched. A full pass is ~120,000
 * requests, so a new year takes a few days of runs; until a city is in, the
 * phone asks the site itself.
 *
 *   NV_YEARS_DIR=work npx tsx tools/namazvakti-dataset/years.ts
 *
 * The site's file carries no year: it is always the current one, so NV_YEAR
 * must be the year the site is serving (the workflow passes this year's).
 *
 * Env: NV_YEARS_DIR (the files, read and written; default ./nv-years),
 *      NV_YEAR (default: this year, UTC), NV_MAX_REQUESTS (25000),
 *      NV_MAX_WALL_MIN (300), NV_DELAY_MS (400), NV_REFRESH_DAYS (60).
 * Writes the changed files' names to <dir>/changed.txt.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { readCities } from './build';
import { parseNamazvaktiXml } from '../../src/providers/namazvaktiParser';
import { namazvaktiBucketAsset, NV_PACK_BUCKETS, packYear, type PackedBucket } from '../../src/providers/namazvaktiPack';

const ORIGIN = 'https://www.namazvakti.com';
const USER_AGENT = 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)';

const int = (name: string, fallback: number): number => {
  const v = process.env[name];
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : fallback;
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function emitOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `${key}=${value}\n`);
}

async function fetchXml(url: string, delayMs: number): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await sleep(delayMs * attempt);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt === 2) {
        console.warn(`  ✗ ${url}: ${(e as Error).message}`);
        return null;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export function readBucket(file: string): PackedBucket | null {
  try {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')) as PackedBucket;
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const dir = path.resolve(process.env.NV_YEARS_DIR ?? 'nv-years');
  const year = int('NV_YEAR', new Date().getUTCFullYear());
  const maxRequests = int('NV_MAX_REQUESTS', 25000);
  const maxWallMs = int('NV_MAX_WALL_MIN', 300) * 60_000;
  const delayMs = int('NV_DELAY_MS', 400);
  const refreshMs = int('NV_REFRESH_DAYS', 60) * 86_400_000;
  fs.mkdirSync(dir, { recursive: true });
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  // The index's located cities with times, and the mirror files they go in.
  const cities = [...readCities().values()].filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon) && c.table !== false);
  const files = new Map<string, PackedBucket>();
  const fileOf = new Map<number, string>();
  for (const c of cities) {
    const name = namazvaktiBucketAsset(c.id);
    fileOf.set(c.id, name);
    if (!files.has(name)) {
      const held = readBucket(path.join(dir, name));
      files.set(name, held && held.year === year ? held : { v: 1, bucket: c.id % NV_PACK_BUCKETS, year, builtAt: '', cities: {} });
    }
  }
  // Missing first, then the oldest read — and, among equals, file by file.
  // Every file the run touches is a release asset to replace, and GitHub
  // allows about 500 content-creating requests an hour (a replace is two):
  // taking the cities in id order put a few in each of all 512 files, so the
  // first run's upload hit that limit and lost the run. File by file, a
  // run's 25,000 cities fill some 110 files and leave the rest untouched.
  const age = (id: number) => {
    const p = files.get(fileOf.get(id)!)!.cities[String(id)];
    return p ? Date.parse(`${p.f}T00:00:00Z`) : -Infinity;
  };
  const bucketOf = (id: number) => id % NV_PACK_BUCKETS;
  const queue = cities
    .map(c => c.id)
    .filter(id => started - age(id) > refreshMs)
    .sort((a, b) => age(a) - age(b) || bucketOf(a) - bucketOf(b) || a - b);
  console.log(`${cities.length} cities with times, ${queue.length} to read for ${year}`);

  const changed = new Set<string>();
  let requests = 0;
  let failures = 0;
  for (const id of queue) {
    if (requests >= maxRequests || Date.now() - started >= maxWallMs) break;
    if (requests >= 50 && failures / requests > 0.5) {
      console.error('More than half the requests failing — stopping.');
      break;
    }
    requests++;
    const xml = await fetchXml(`${ORIGIN}/XML.php?cityID=${id}`, delayMs);
    if (!xml || !/<prayertimes\b/.test(xml)) {
      failures++;
      continue;
    }
    try {
      const parsed = parseNamazvaktiXml(xml, year, new Date().toISOString());
      if (parsed.cityId !== id) throw new Error(`asked for ${id}, got ${parsed.cityId}`);
      const name = fileOf.get(id)!;
      files.get(name)!.cities[String(id)] = packYear(parsed);
      changed.add(name);
    } catch (e) {
      failures++;
      console.warn(`  ✗ city ${id}: ${(e as Error).message}`);
    }
    if (requests % 1000 === 0) console.log(`  ${requests} read, ${failures} failed`);
  }

  for (const name of changed) {
    const f = files.get(name)!;
    f.builtAt = new Date().toISOString();
    fs.writeFileSync(path.join(dir, name), zlib.gzipSync(JSON.stringify(f), { level: 9 }));
  }
  const held = [...files.values()].reduce((n, f) => n + Object.keys(f.cities).length, 0);
  const index = { v: 1, year, builtAt: new Date().toISOString(), cities: cities.length, held, complete: held >= cities.length, files: files.size };
  fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify(index)}\n`);
  fs.writeFileSync(path.join(dir, 'changed.txt'), [...changed].join('\n') + (changed.size ? '\n' : ''));
  console.log(`read ${requests} (${failures} failed); ${changed.size} files changed; ${held}/${cities.length} cities held (${today})`);
  emitOutput('held', String(held));
  emitOutput('cities', String(cities.length));
  emitOutput('changed', String(changed.size));
  return failures > 0 && failures === requests ? 1 : 0;
}

if (require.main === module) {
  main()
    .then(c => process.exit(c))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
