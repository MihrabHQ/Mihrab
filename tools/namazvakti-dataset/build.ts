/**
 * Build the namazvakti.com city index the app looks its nearest city up in.
 *
 * ── WHY AN INDEX AND NOT THE TIMES ────────────────────────────────────
 *
 * Sweden's builder (tools/ifis-dataset) mirrors the TIMES: 109 cities, a
 * rolling window, a few megabytes. namazvakti.com publishes about a hundred
 * thousand places, and a year of times for each is gigabytes — not a thing
 * to keep in a git repository or serve from its raw CDN. What the site does
 * NOT have is a way to find "the nearest city to these coordinates": no
 * search, no API, only lists to click through. So the server-side job here
 * does the part a phone cannot — walk every list once and read every city's
 * coordinates — and publishes it as small geographic tiles. The phone then
 * fetches its own nearest city's year straight from the site, once a year
 * (src/providers/namazvakti.ts). A hundred thousand phones asking for their
 * one file each is far gentler on the site than one job mirroring them all.
 *
 * ── HOW IT RUNS ───────────────────────────────────────────────────────
 *
 * Incremental and resumable, because the first full pass is ~100k requests
 * and no run can do them all:
 *
 *   1. LIST. Every NV_LIST_REFRESH_DAYS, the country and state lists are read
 *      into a queue of states (~250 requests); then each state's city list
 *      is read, as far as the budget allows, carrying on next run where this
 *      one stopped. A city seen for the first time joins the index without
 *      coordinates.
 *   2. LOCATE. Every city without coordinates has the first few hundred
 *      bytes of its XML read — the root element carries latitude, longitude
 *      and the height the site's temkin is worked out for — and the rest of
 *      the file is not downloaded.
 *   3. PUBLISH. Every located city is written into a TILE_DEG° tile, and
 *      index.json says how far along the whole thing is.
 *
 * Everything is written at the end of every run, whatever stopped it, so a
 * run that runs out of time still keeps what it did.
 *
 *   npx tsx tools/namazvakti-dataset/build.ts
 *
 * Env: NV_MAX_REQUESTS (default 20000), NV_MAX_WALL_MIN (300),
 *      NV_DELAY_MS (300), NV_LIST_REFRESH_DAYS (30).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  parseCityInfo,
  parseCityList,
  parseCountryList,
  parseStateList,
  tileKey,
  type CountryRef,
} from './parse';

const ORIGIN = 'https://www.namazvakti.com';
const USER_AGENT =
  'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)';

const ROOT = path.join(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'data/prayer-times/namazvakti/v1');
const TILES_DIR = path.join(OUT_DIR, 'tiles');
const CITIES_PATH = path.join(OUT_DIR, 'cities.tsv');
const COUNTRIES_PATH = path.join(OUT_DIR, 'countries.json');
const CRAWL_PATH = path.join(OUT_DIR, 'crawl.json');
const INDEX_PATH = path.join(OUT_DIR, 'index.json');

const int = (name: string, fallback: number): number => {
  const v = process.env[name];
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : fallback;
};

export type CityRow = {
  id: number;
  countryId: number;
  /** NaN until located. */
  lat: number;
  lon: number;
  height: number;
  name: string;
  state: string;
};

type CrawlState = {
  /** When the current pass over the lists began, ISO. */
  listStartedAt: string | null;
  /** When the last complete pass ended, ISO. */
  listCompletedAt: string | null;
  /** [countryId, state] for every state of every country. */
  queue: [number, string][];
  /** How far into `queue` the current pass has got. */
  queuePos: number;
  /** Cities whose XML had no usable coordinates: not asked again until the next list pass. */
  unlocatable: number[];
};

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function emitOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `${key}=${value}\n`);
}

const TSV_HEADER = 'id\tcountryId\tlat\tlon\theight\tname\tstate';
const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();

export function readCities(file: string = CITIES_PATH): Map<number, CityRow> {
  const out = new Map<number, CityRow>();
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n').slice(1)) {
    if (!line) continue;
    const [id, countryId, lat, lon, height, name, state] = line.split('\t');
    out.set(Number(id), {
      id: Number(id),
      countryId: Number(countryId),
      lat: lat === '' ? NaN : Number(lat),
      lon: lon === '' ? NaN : Number(lon),
      height: Number(height) || 0,
      name: name ?? '',
      state: state ?? '',
    });
  }
  return out;
}

function writeCities(cities: Map<number, CityRow>): void {
  const rows = [...cities.values()].sort((a, b) => a.id - b.id);
  const lines = rows.map(c =>
    [
      c.id,
      c.countryId,
      Number.isFinite(c.lat) ? c.lat : '',
      Number.isFinite(c.lon) ? c.lon : '',
      c.height || 0,
      clean(c.name),
      clean(c.state),
    ].join('\t'),
  );
  fs.writeFileSync(CITIES_PATH, `${[TSV_HEADER, ...lines].join('\n')}\n`, 'utf8');
}

/** One tile file: [id, lat, lon, name] per city, nearest-first search on the phone. */
export type TileFile = { v: 1; tile: string; cities: TileRow[] };
/** [id, lat, lon, name] and the height when it is not the usual 250 m. */
type TileRow = [number, number, number, string] | [number, number, number, string, number];

function writeTiles(cities: Map<number, CityRow>): number {
  const tiles = new Map<string, TileRow[]>();
  for (const c of cities.values()) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
    const key = tileKey(c.lat, c.lon);
    const list = tiles.get(key) ?? [];
    list.push(c.height && c.height !== 250 ? [c.id, c.lat, c.lon, clean(c.name), c.height] : [c.id, c.lat, c.lon, clean(c.name)]);
    tiles.set(key, list);
  }
  fs.mkdirSync(TILES_DIR, { recursive: true });
  const keep = new Set<string>();
  for (const [key, list] of tiles) {
    list.sort((a, b) => a[0] - b[0]);
    const file: TileFile = { v: 1, tile: key, cities: list };
    fs.writeFileSync(path.join(TILES_DIR, `${key}.json`), `${JSON.stringify(file)}\n`, 'utf8');
    keep.add(`${key}.json`);
  }
  for (const f of fs.readdirSync(TILES_DIR)) {
    if (f.endsWith('.json') && !keep.has(f)) fs.unlinkSync(path.join(TILES_DIR, f));
  }
  return tiles.size;
}

class Budget {
  readonly started = Date.now();
  requests = 0;
  failures = 0;
  constructor(
    readonly maxRequests: number,
    readonly maxWallMs: number,
    readonly delayMs: number,
  ) {}
  get spent(): boolean {
    return this.requests >= this.maxRequests || Date.now() - this.started >= this.maxWallMs;
  }
  get unhealthy(): boolean {
    return this.requests >= 20 && this.failures / this.requests > 0.5;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** GET a page, politely: one at a time, a pause before each, two tries. */
async function get(budget: Budget, url: string, headOnly?: RegExp): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await sleep(budget.delayMs * attempt);
    budget.requests++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      if (!headOnly) return await res.text();
      // Read only until the pattern has arrived, then stop the download.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (value) text += decoder.decode(value, { stream: true });
        if (headOnly.test(text) || done || text.length > 64 * 1024) break;
      }
      void reader.cancel().catch(() => {});
      ctrl.abort();
      return text;
    } catch (e) {
      if (attempt === 2) {
        budget.failures++;
        console.warn(`  ✗ ${url}: ${(e as Error).message}`);
        return null;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function main(): Promise<number> {
  const budget = new Budget(
    int('NV_MAX_REQUESTS', 20000),
    int('NV_MAX_WALL_MIN', 300) * 60_000,
    int('NV_DELAY_MS', 300),
  );
  const refreshMs = int('NV_LIST_REFRESH_DAYS', 30) * 86_400_000;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const cities = readCities();
  let countries = readJson<CountryRef[]>(COUNTRIES_PATH, []);
  const crawl = readJson<CrawlState>(CRAWL_PATH, {
    listStartedAt: null,
    listCompletedAt: null,
    queue: [],
    queuePos: 0,
    unlocatable: [],
  });
  const unlocatable = new Set(crawl.unlocatable);
  const before = { cities: cities.size, located: [...cities.values()].filter(c => Number.isFinite(c.lat)).length };

  let finished = false;
  const save = () => {
    crawl.unlocatable = [...unlocatable].sort((a, b) => a - b);
    writeCities(cities);
    fs.writeFileSync(COUNTRIES_PATH, `${JSON.stringify(countries, null, 1)}\n`, 'utf8');
    fs.writeFileSync(CRAWL_PATH, `${JSON.stringify(crawl)}\n`, 'utf8');
    const tiles = writeTiles(cities);
    const located = [...cities.values()].filter(c => Number.isFinite(c.lat)).length;
    const listDone = crawl.listCompletedAt != null;
    const index = {
      version: 1,
      builtAt: new Date().toISOString(),
      source: ORIGIN,
      tileDeg: 5,
      serverStatus: budget.unhealthy ? 'warning' : 'ok',
      cities: cities.size,
      located,
      tiles,
      countries: countries.length,
      listStartedAt: crawl.listStartedAt,
      listCompletedAt: crawl.listCompletedAt,
      complete: listDone && located + unlocatable.size >= cities.size,
    };
    fs.writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    console.log(
      `${cities.size} cities (+${cities.size - before.cities}), ${located} located ` +
        `(+${located - before.located}), ${tiles} tiles; ${budget.requests} requests, ` +
        `${budget.failures} failed${finished ? '' : ' — stopped on budget'}`,
    );
    emitOutput('cities', String(cities.size));
    emitOutput('located', String(located));
    emitOutput('complete', String(index.complete));
  };

  // A long run (the first pass is most of a day) keeps its progress as it
  // goes, so a crash or a cancelled job loses minutes, not hours.
  let savedAt = 0;
  const checkpoint = () => {
    if (budget.requests - savedAt >= 1000) {
      savedAt = budget.requests;
      save();
    }
  };

  try {
    // ── 1. LIST ────────────────────────────────────────────────────────
    const passDone = crawl.queue.length > 0 && crawl.queuePos >= crawl.queue.length;
    const stale =
      !crawl.listCompletedAt || Date.now() - Date.parse(crawl.listCompletedAt) > refreshMs;
    if (crawl.queue.length === 0 || (passDone && stale)) {
      console.log('listing countries and states');
      const html = await get(budget, `${ORIGIN}/CountryList.php?WSLanguage=EN`);
      const listed = html ? parseCountryList(html) : [];
      if (listed.length < 100) throw new Error(`country list has only ${listed.length} countries`);
      countries = listed;
      const queue: [number, string][] = [];
      for (const c of listed) {
        if (budget.spent) throw new Error('budget spent while listing states');
        const page = await get(budget, `${ORIGIN}/StateList.php?countryID=${c.id}&WSLanguage=EN`);
        if (!page) continue;
        const states = parseStateList(page, c.id);
        for (const s of states) queue.push([c.id, s]);
        // A country listed without states puts its cities on this page.
        if (states.length === 0) {
          for (const city of parseCityList(page)) {
            const known = cities.get(city.id);
            if (!known) {
              cities.set(city.id, { id: city.id, countryId: c.id, lat: NaN, lon: NaN, height: 0, name: city.name, state: '' });
            }
          }
        }
      }
      crawl.queue = queue;
      crawl.queuePos = 0;
      crawl.listStartedAt = new Date().toISOString();
      unlocatable.clear();
      console.log(`${listed.length} countries, ${queue.length} states queued`);
    }
    while (crawl.queuePos < crawl.queue.length && !budget.spent) {
      const [countryId, state] = crawl.queue[crawl.queuePos];
      const page = await get(
        budget,
        `${ORIGIN}/CityList.php?countryID=${countryId}&state=${encodeURIComponent(state)}&WSLanguage=EN`,
      );
      if (page) {
        for (const city of parseCityList(page)) {
          const known = cities.get(city.id);
          if (known) {
            known.state = state;
            known.countryId = countryId;
            if (!known.name) known.name = city.name;
          } else {
            cities.set(city.id, { id: city.id, countryId, lat: NaN, lon: NaN, height: 0, name: city.name, state });
          }
        }
      }
      crawl.queuePos++;
      if (budget.unhealthy) throw new Error('origin unhealthy while listing cities');
      checkpoint();
    }
    if (crawl.queuePos >= crawl.queue.length && crawl.queue.length > 0) {
      if (!crawl.listCompletedAt || crawl.listCompletedAt < (crawl.listStartedAt ?? '')) {
        crawl.listCompletedAt = new Date().toISOString();
      }
    }

    // ── 2. LOCATE ──────────────────────────────────────────────────────
    const todo = [...cities.values()]
      .filter(c => !Number.isFinite(c.lat) && !unlocatable.has(c.id))
      .sort((a, b) => a.id - b.id);
    for (const c of todo) {
      if (budget.spent) break;
      const head = await get(budget, `${ORIGIN}/XML.php?cityID=${c.id}`, /<cityinfo\b[^>]*>/);
      const info = head ? parseCityInfo(head) : null;
      if (info) {
        c.lat = info.lat;
        c.lon = info.lon;
        c.height = info.height;
        if (!c.countryId) c.countryId = info.countryId;
      } else if (head != null) {
        unlocatable.add(c.id);
      }
      if (budget.unhealthy) throw new Error('origin unhealthy while locating cities');
      checkpoint();
    }
    finished = !budget.spent;
    save();
    return 0;
  } catch (e) {
    console.error(`stopped: ${(e as Error).message}`);
    save();
    return budget.unhealthy ? 2 : 3;
  }
}

if (require.main === module) {
  main().then(c => process.exit(c));
}
