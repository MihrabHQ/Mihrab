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
 * ── WHICH YEAR ────────────────────────────────────────────────────────
 *
 * The site serves one year per city, and the file says which
 * (`<!--2027-->`, read by `parseNamazvaktiXml`). Each answer is filed under
 * the year the FILE gives. From 1 December the run also builds next year's
 * release (`targetYears`): the cities that year lacks are asked first, and
 * while the site still answers with this year's file the run notices
 * (`SITE_SWITCH_SAMPLE`) and spends the rest of its budget on this year, as
 * it would have anyway. One request per city either way.
 *
 * ── WHAT THE RELEASE HAS ──────────────────────────────────────────────
 *
 * Each year's directory holds `release-assets.txt` (the release's asset
 * names, written by the workflow) and the previous run's `index.json`,
 * whose `buckets` lists every file it counted cities in. A file the index
 * counted that the release does not have never got there — its upload ran
 * into GitHub's rate limit and nothing checked (thirteen of 2026's: b491,
 * b493–b502, b510, b511, written on 16 October). Its cities are read again
 * FIRST — as are those of any file a release that has files lacks — so the
 * next run rebuilds and uploads it, rather than waiting until every
 * lower-numbered file is full. A file the release has that is not on
 * disk did not download: its cities are left alone this run, because a
 * partial rebuild uploaded over it would lose the rest.
 *
 * Env: NV_YEARS_DIR (the years' directories `<dir>/<year>/`, read and
 *      written; default ./nv-years), NV_YEARS (space-separated; default
 *      `targetYears(now)`), NV_MAX_REQUESTS (25000), NV_MAX_WALL_MIN (300),
 *      NV_DELAY_MS (400), NV_REFRESH_DAYS (60).
 * Writes each year's changed files' names to <dir>/<year>/changed.txt.
 *
 *   npx tsx tools/namazvakti-dataset/years.ts verify <dir>/<year>
 *
 * prints the files that year's index counts and its `release-assets.txt`
 * lacks (the workflow uploads them again, and fails if they still are).
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

/** The years a run builds: this one, and from 1 December (UTC) the next as well. */
export function targetYears(now: Date): number[] {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() === 11 ? [y, y + 1] : [y];
}

/** One request planned: a city, and the year it is asked for. */
export type Planned = { id: number; year: number };

export type PlanInput = {
  /** Every city with times. */
  ids: readonly number[];
  /** The years being built, ascending. */
  years: readonly number[];
  now: number;
  refreshMs: number;
  /** When the city's year was read (ms), -Infinity when the year does not have it. */
  readAt: (year: number, id: number) => number;
  /** Files the year's last index counted and its release lacks: read again first. */
  lost: (year: number) => ReadonlySet<string>;
  /** Files the release has that are not on disk: not touched this run. */
  undownloaded: (year: number) => ReadonlySet<string>;
};

/**
 * The order a run asks for cities. The latest year first (from December,
 * the year about to begin); within a year the cities of files lost on the
 * way to the release, then every city the year lacks, file by file, then
 * the ones read longest ago. Each city once — one request answers for
 * whichever year the site is serving.
 *
 * File by file because every file a run touches is a release asset to
 * replace, and GitHub allows about 500 content-creating requests an hour (a
 * replace is two): taking the cities in id order put a few in each of all
 * 512 files, so the first run's upload hit that limit.
 */
export function planQueue(input: PlanInput): Planned[] {
  const bucketOf = (id: number) => id % NV_PACK_BUCKETS;
  const out: Planned[] = [];
  const seen = new Set<number>();
  const push = (year: number, ids: number[]) => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, year });
    }
  };
  for (const year of [...input.years].sort((a, b) => b - a)) {
    const lost = input.lost(year);
    const skip = input.undownloaded(year);
    const ids = input.ids.filter(id => !skip.has(namazvaktiBucketAsset(id)));
    const byFile = (a: number, b: number) => bucketOf(a) - bucketOf(b) || a - b;
    const missing = ids.filter(id => input.readAt(year, id) === -Infinity);
    push(year, missing.filter(id => lost.has(namazvaktiBucketAsset(id))).sort(byFile));
    push(year, missing.sort(byFile));
    const due = ids.filter(id => {
      const at = input.readAt(year, id);
      return at !== -Infinity && input.now - at > input.refreshMs;
    });
    push(year, due.sort((a, b) => input.readAt(year, a) - input.readAt(year, b) || byFile(a, b)));
  }
  return out;
}

/**
 * The files an index counts that the release does not have: `index.buckets`
 * against the release's asset names.
 */
export function missingFromRelease(
  index: { buckets?: Record<string, number> } | null,
  releaseAssets: readonly string[],
): string[] {
  const have = new Set(releaseAssets);
  return Object.entries(index?.buckets ?? {})
    .filter(([name, held]) => held > 0 && !have.has(name))
    .map(([name]) => name)
    .sort();
}

/**
 * After this many answers to requests planned for next year, all of them
 * this year's file, the site has not switched yet: the rest of the run
 * goes to this year.
 */
export const SITE_SWITCH_SAMPLE = 20;

function readLines(file: string): string[] | null {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

function readIndex(file: string): { buckets?: Record<string, number> } | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

type YearState = {
  year: number;
  dir: string;
  files: Map<string, PackedBucket>;
  changed: Set<string>;
  lost: Set<string>;
  undownloaded: Set<string>;
};

function loadYear(root: string, year: number, cities: readonly { id: number }[]): YearState {
  const dir = path.join(root, String(year));
  fs.mkdirSync(dir, { recursive: true });
  const release = readLines(path.join(dir, 'release-assets.txt'));
  const files = new Map<string, PackedBucket>();
  const undownloaded = new Set<string>();
  for (const c of cities) {
    const name = namazvaktiBucketAsset(c.id);
    if (files.has(name)) continue;
    const held = readBucket(path.join(dir, name));
    if (!held && release?.includes(name)) undownloaded.add(name);
    files.set(name, held && held.year === year ? held : { v: 1, bucket: c.id % NV_PACK_BUCKETS, year, builtAt: '', cities: {} });
  }
  // Read before this run's index replaces it. An index from before
  // `buckets` existed names no files, so a release that has files at all is
  // taken to be missing every other one: their cities lead either way.
  const lost = new Set(release ? missingFromRelease(readIndex(path.join(dir, 'index.json')), release) : []);
  if (release?.some(n => n.endsWith('.json.gz'))) {
    for (const name of files.keys()) if (!release.includes(name)) lost.add(name);
  }
  if (undownloaded.size) console.warn(`${year}: ${undownloaded.size} release files not on disk — left alone: ${[...undownloaded].join(' ')}`);
  if (lost.size) console.warn(`${year}: ${lost.size} files the index counts are not in the release — read again first: ${[...lost].join(' ')}`);
  return { year, dir, files, changed: new Set(), lost, undownloaded };
}

export async function main(): Promise<number> {
  const root = path.resolve(process.env.NV_YEARS_DIR ?? 'nv-years');
  const years = (process.env.NV_YEARS ?? '').split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
  const targets = years.length ? years.sort((a, b) => a - b) : targetYears(new Date());
  const maxRequests = int('NV_MAX_REQUESTS', 25000);
  const maxWallMs = int('NV_MAX_WALL_MIN', 300) * 60_000;
  const delayMs = int('NV_DELAY_MS', 400);
  const refreshMs = int('NV_REFRESH_DAYS', 60) * 86_400_000;
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  // The index's located cities with times, and the mirror files they go in.
  const cities = [...readCities().values()].filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon) && c.table !== false);
  const state = new Map(targets.map(y => [y, loadYear(root, y, cities)] as const));
  const readAt = (year: number, id: number) => {
    const p = state.get(year)?.files.get(namazvaktiBucketAsset(id))?.cities[String(id)];
    return p ? Date.parse(`${p.f}T00:00:00Z`) : -Infinity;
  };
  const plan = (ys: readonly number[], done: ReadonlySet<number>) =>
    planQueue({
      ids: cities.map(c => c.id).filter(id => !done.has(id)),
      years: ys,
      now: started,
      refreshMs,
      readAt,
      lost: y => state.get(y)!.lost,
      undownloaded: y => state.get(y)!.undownloaded,
    });
  let queue = plan(targets, new Set());
  console.log(`${cities.length} cities with times, ${queue.length} to read for ${targets.join(' and ')}`);

  const latest = targets[targets.length - 1];
  const done = new Set<number>();
  let askedForLatest = 0;
  let latestAnswered = 0;
  let requests = 0;
  let failures = 0;
  for (let i = 0; i < queue.length; i++) {
    const { id, year: planned } = queue[i];
    if (requests >= maxRequests || Date.now() - started >= maxWallMs) break;
    if (requests >= 50 && failures / requests > 0.5) {
      console.error('More than half the requests failing — stopping.');
      break;
    }
    requests++;
    done.add(id);
    const xml = await fetchXml(`${ORIGIN}/XML.php?cityID=${id}`, delayMs);
    if (!xml || !/<prayertimes\b/.test(xml)) {
      failures++;
      continue;
    }
    try {
      // The year is the file's own (`<!--2027-->`); `planned` only if it has none.
      const parsed = parseNamazvaktiXml(xml, planned, new Date().toISOString());
      if (parsed.cityId !== id) throw new Error(`asked for ${id}, got ${parsed.cityId}`);
      const target = state.get(parsed.year);
      if (!target) throw new Error(`the site served ${parsed.year}, not ${targets.join('/')}`);
      const name = namazvaktiBucketAsset(id);
      if (target.undownloaded.has(name)) continue;
      target.files.get(name)!.cities[String(id)] = packYear(parsed);
      target.changed.add(name);
      if (targets.length > 1 && planned === latest) {
        askedForLatest++;
        if (parsed.year === latest) latestAnswered++;
        if (askedForLatest === SITE_SWITCH_SAMPLE && latestAnswered === 0) {
          console.log(`The site still serves ${parsed.year}: the rest of the run is for ${targets.slice(0, -1).join(' and ')}.`);
          queue = [...queue.slice(0, i + 1), ...plan(targets.slice(0, -1), done)];
        }
      }
    } catch (e) {
      failures++;
      console.warn(`  ✗ city ${id}: ${(e as Error).message}`);
    }
    if (requests % 1000 === 0) console.log(`  ${requests} read, ${failures} failed`);
  }

  let changedFiles = 0;
  for (const s of state.values()) {
    for (const name of s.changed) {
      const f = s.files.get(name)!;
      f.builtAt = new Date().toISOString();
      fs.writeFileSync(path.join(s.dir, name), zlib.gzipSync(JSON.stringify(f), { level: 9 }));
    }
    const buckets: Record<string, number> = {};
    for (const [name, f] of s.files) {
      const n = Object.keys(f.cities).length;
      if (n > 0) buckets[name] = n;
    }
    const held = Object.values(buckets).reduce((a, b) => a + b, 0);
    // `files` is the files that hold cities — what the release should have —
    // and `buckets` names them, for the next run and the workflow's check.
    const index = { v: 1, year: s.year, builtAt: new Date().toISOString(), cities: cities.length, held, complete: held >= cities.length, files: Object.keys(buckets).length, buckets };
    fs.writeFileSync(path.join(s.dir, 'index.json'), `${JSON.stringify(index)}\n`);
    fs.writeFileSync(path.join(s.dir, 'changed.txt'), [...s.changed].join('\n') + (s.changed.size ? '\n' : ''));
    console.log(`${s.year}: ${s.changed.size} files changed; ${held}/${cities.length} cities held in ${index.files} files (${today})`);
    emitOutput(`held_${s.year}`, String(held));
    changedFiles += s.changed.size;
  }
  console.log(`read ${requests} (${failures} failed)`);
  emitOutput('cities', String(cities.length));
  emitOutput('changed', String(changedFiles));
  return failures > 0 && failures === requests ? 1 : 0;
}

/** `years.ts verify <dir>`: the files that year's index counts and its release lacks, one a line. */
function verify(dir: string): number {
  const release = readLines(path.join(dir, 'release-assets.txt')) ?? [];
  for (const name of missingFromRelease(readIndex(path.join(dir, 'index.json')), release)) console.log(name);
  return 0;
}

if (require.main === module) {
  (process.argv[2] === 'verify' ? Promise.resolve(verify(path.resolve(process.argv[3] ?? '.'))) : main())
    .then(c => process.exit(c))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
