/**
 * Islamiska Förbundet dataset builder — runs server-side in GitHub Actions
 * (see `.github/workflows/ifis-dataset.yml`), NOT on user devices.
 *
 * Scrapes the bönetider widget once for every Swedish city in
 * `src/providers/islamiskaForbundetCoords.json` and writes:
 *   • data/prayer-times/v1/cities/<slug>.json  — full rolling window per city
 *   • data/prayer-times/v1/index.json          — coverage + city list
 *   • src/providers/data/ifisSeed.json         — compact bundled seed (near-term)
 *
 * Design notes:
 *   • Incremental: existing days are kept; only MISSING days up to the horizon
 *     are fetched, so steady-state runs make ~one request per city per new day.
 *   • Checked: every row — fetched now or kept from before — must have its
 *     Dhuhr within minutes of solar noon. The widget answers a date in a year
 *     it has not published yet with the same date of THIS year, and between
 *     the two years' clock changes that row is an hour off. Such rows are
 *     dropped, not stored; the phone falls back for those days.
 *   • Re-read: a stored day fetched REFRESH_AFTER_DAYS ago or more is fetched
 *     again when the budget allows (nearest date first), so a year the site
 *     publishes late replaces the copy it served meanwhile.
 *   • Date-major: fetches near-term dates for ALL cities first, so a budget cap
 *     still yields full near-term coverage everywhere (freshness passes).
 *   • Gentle: fixed delay between requests + bounded retries.
 *   • Alarming on failure: exits non-zero (→ the workflow emails) when the
 *     origin looks down (high failure rate) or near-term coverage is missing.
 *
 * Run: `npx tsx tools/ifis-dataset/build.ts`
 */
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseIslamiskaForbundetHtml,
  citySlug,
  timingsToTuple,
  type DatasetDayTuple,
} from '../../src/providers/islamiskaForbundetParser';
import { dhuhrOffsetFromNoon, DHUHR_NOON_TOLERANCE_MIN } from '../../src/prayer/tableDayCheck';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

const COORDS_PATH = join(REPO, 'src/providers/islamiskaForbundetCoords.json');
const OUT_DIR = join(REPO, 'data/prayer-times/v1');
const CITIES_DIR = join(OUT_DIR, 'cities');
const INDEX_PATH = join(OUT_DIR, 'index.json');
const SEED_PATH = join(REPO, 'src/providers/data/ifisSeed.json');

const WIDGET_URL =
  'https://www.islamiskaforbundet.se/wp-content/plugins/bonetider/Bonetider_Widget.php';
const TZ = 'Europe/Stockholm';

// Tunables (overridable via env for the initial backfill).
const HORIZON_DAYS = intEnv('IFIS_HORIZON_DAYS', 400); // how far ahead to cover
const DROP_BEFORE_DAYS = intEnv('IFIS_DROP_BEFORE_DAYS', 3); // prune old past days
const SEED_DAYS = intEnv('IFIS_SEED_DAYS', 60); // bundled seed window
const MAX_REQUESTS = intEnv('IFIS_MAX_REQUESTS', 8000); // per-run request budget
const MAX_WALL_MS = intEnv('IFIS_MAX_WALL_MIN', 50) * 60_000; // per-run time budget
const REQUEST_DELAY_MS = intEnv('IFIS_REQUEST_DELAY_MS', 300);
// A stored day this old is read again (budget allowing), in case the site
// has since published the year it was copying from the current one.
const REFRESH_AFTER_DAYS = intEnv('IFIS_REFRESH_AFTER_DAYS', 90);
// Per-city upcoming-days coverage floor. The server must hold ≥ a month for
// every city: warn (email, run stays green) under WARN, hard-fail under FAIL.
const COVERAGE_WARN_DAYS = intEnv('IFIS_COVERAGE_WARN_DAYS', 40);
const COVERAGE_FAIL_DAYS = intEnv('IFIS_COVERAGE_FAIL_DAYS', 30);

function intEnv(name: string, def: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
}

/** Expose a value to later workflow steps (no-op outside GitHub Actions). */
async function emitOutput(key: string, value: string): Promise<void> {
  const f = process.env.GITHUB_OUTPUT;
  if (f) await appendFile(f, `${key}=${value}\n`);
}

type CityDays = Record<string, DatasetDayTuple>;
/** When each day was last read from the site (YYYY-MM-DD). Phones ignore it. */
type FetchedOn = Record<string, string>;
type CityFile = {
  city: string;
  slug: string;
  timezone: string;
  builtAt: string;
  days: CityDays;
  fetched?: FetchedOn;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Stockholm "today" as YYYY-MM-DD (en-CA yields ISO order). */
function stockholmToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Calendar date string N days after `baseKey` (computed at noon UTC, DST-safe). */
function addDays(baseKey: string, n: number): string {
  const base = new Date(`${baseKey}T12:00:00Z`);
  return new Date(base.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

async function fetchDay(city: string, dateKey: string): Promise<DatasetDayTuple | null> {
  const body = new URLSearchParams({
    ifis_bonetider_widget_city: `${city}, SE`,
    ifis_bonetider_widget_date: dateKey,
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch(WIDGET_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'text/html,*/*',
          'User-Agent': 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab)',
          Origin: 'https://www.islamiskaforbundet.se',
          Referer: 'https://www.islamiskaforbundet.se/bonetider/',
        },
        body: body.toString(),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        if (res.status >= 500 && attempt < 3) {
          await sleep(500 * attempt);
          continue;
        }
        return null;
      }
      const html = await res.text();
      const timings = parseIslamiskaForbundetHtml(html, city);
      return timingsToTuple(timings);
    } catch {
      if (attempt < 3) {
        await sleep(500 * attempt);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function loadExistingCity(slug: string): Promise<{ days: CityDays; fetched: FetchedOn }> {
  const p = join(CITIES_DIR, `${slug}.json`);
  if (!existsSync(p)) return { days: {}, fetched: {} };
  try {
    const parsed = JSON.parse(await readFile(p, 'utf8')) as CityFile;
    return { days: parsed.days ?? {}, fetched: parsed.fetched ?? {} };
  } catch {
    return { days: {}, fetched: {} };
  }
}

/**
 * The row's Dhuhr against the sun's own noon. The authorities' margin is a
 * few minutes; an hour means the row is the other side of a clock change —
 * the widget's copy of this year standing in for a year it has not
 * published. Returns the offset so the log can say how far.
 */
function dayOffsetFromNoon(dateKey: string, tuple: DatasetDayTuple, longitude: number): number {
  return dhuhrOffsetFromNoon(dateKey, tuple[3], longitude, TZ);
}

async function main(): Promise<void> {
  await mkdir(CITIES_DIR, { recursive: true });
  await mkdir(dirname(SEED_PATH), { recursive: true });

  const coords = JSON.parse(await readFile(COORDS_PATH, 'utf8')) as Record<
    string,
    { lat: number; lng: number }
  >;
  const cities = Object.keys(coords).map(name => ({ name, slug: citySlug(name) }));

  // Sanity: slugs must be unique or per-city files collide.
  const slugSet = new Set<string>();
  for (const c of cities) {
    if (slugSet.has(c.slug)) throw new Error(`Duplicate city slug "${c.slug}" (${c.name})`);
    slugSet.add(c.slug);
  }

  const today = stockholmToday();
  const dropBefore = addDays(today, -DROP_BEFORE_DAYS);
  const refreshBefore = addDays(today, -REFRESH_AFTER_DAYS);
  const horizonKeys: string[] = [];
  for (let i = 0; i <= HORIZON_DAYS; i++) horizonKeys.push(addDays(today, i));

  // Load + prune existing data. A kept day is checked like a fetched one:
  // the copies of 2026 that stood for 2027 were stored before the check
  // existed, and the next build must not keep them.
  const data = new Map<string, CityDays>();
  const fetchedOn = new Map<string, FetchedOn>();
  const rejected: string[] = [];
  for (const c of cities) {
    const { days, fetched } = await loadExistingCity(c.slug);
    for (const k of Object.keys(days)) {
      if (k < dropBefore) {
        delete days[k];
        delete fetched[k];
        continue;
      }
      const off = dayOffsetFromNoon(k, days[k], coords[c.name].lng);
      if (!(Math.abs(off) <= DHUHR_NOON_TOLERANCE_MIN)) {
        rejected.push(`${c.name} ${k} (kept; Dhuhr ${days[k][3]} is ${Math.round(off)} min from noon)`);
        delete days[k];
        delete fetched[k];
      }
    }
    for (const k of Object.keys(fetched)) if (!days[k]) delete fetched[k];
    data.set(c.slug, days);
    fetchedOn.set(c.slug, fetched);
  }

  // Date-major fetch of missing days, within budgets.
  const startedAt = Date.now();
  let requests = 0;
  let failures = 0;
  let refreshed = 0;
  let budgetHit = false;
  const outOfBudget = () => requests >= MAX_REQUESTS || Date.now() - startedAt >= MAX_WALL_MS;

  /** Fetch one day and store it if it is that day's row. */
  const readDay = async (c: { name: string; slug: string }, dateKey: string): Promise<void> => {
    const days = data.get(c.slug)!;
    const tuple = await fetchDay(c.name, dateKey);
    requests++;
    if (!tuple) {
      failures++;
    } else {
      const off = dayOffsetFromNoon(dateKey, tuple, coords[c.name].lng);
      if (Math.abs(off) <= DHUHR_NOON_TOLERANCE_MIN) {
        days[dateKey] = tuple;
        fetchedOn.get(c.slug)![dateKey] = today;
      } else {
        rejected.push(`${c.name} ${dateKey} (Dhuhr ${tuple[3]} is ${Math.round(off)} min from noon)`);
        // A copy of another year. Whatever was stored for the day stays
        // only if it passed its own check above; the copy does not replace it.
      }
    }
    await sleep(REQUEST_DELAY_MS);
  };

  outer: for (const dateKey of horizonKeys) {
    for (const c of cities) {
      if (data.get(c.slug)![dateKey]) continue; // already have it (incremental)
      if (outOfBudget()) {
        budgetHit = true;
        break outer;
      }
      await readDay(c, dateKey);
    }
  }

  // Then re-read what was fetched long ago, nearest date first. A day with no
  // fetch stamp predates the stamps (October 2026) and counts as old.
  if (!budgetHit) {
    refresh: for (const dateKey of horizonKeys.slice(7)) {
      for (const c of cities) {
        const days = data.get(c.slug)!;
        if (!days[dateKey]) continue;
        const on = fetchedOn.get(c.slug)![dateKey];
        if (on && on >= refreshBefore) continue;
        if (outOfBudget()) {
          budgetHit = true;
          break refresh;
        }
        await readDay(c, dateKey);
        refreshed++;
      }
    }
  }

  // Detect a dead/unhealthy origin: many attempts, mostly failing.
  const failRate = requests > 0 ? failures / requests : 0;
  const originUnhealthy = requests >= 20 && failRate > 0.5;

  // Write per-city files (sorted keys for stable diffs).
  const builtAt = new Date().toISOString();
  // Coverage = number of UPCOMING days (today onward) a city holds. Robust to
  // sparse gaps (it's a count, not a consecutive run). Cities the widget never
  // returns (0 rows) are "dead": tolerated + excluded from the floor, since
  // their coordinates fall back to AlAdhan/on-device at runtime.
  let minCoverage = Infinity;
  let minCoverageCity = '';
  const deadCities: string[] = [];
  for (const c of cities) {
    const days = data.get(c.slug)!;
    const sortedKeys = Object.keys(days).sort();
    const sortedDays: CityDays = {};
    for (const k of sortedKeys) sortedDays[k] = days[k];
    const fetched: FetchedOn = {};
    for (const k of sortedKeys) {
      const on = fetchedOn.get(c.slug)![k];
      if (on) fetched[k] = on;
    }
    const file: CityFile = {
      city: c.name,
      slug: c.slug,
      timezone: TZ,
      builtAt,
      days: sortedDays,
      fetched,
    };
    await writeFile(join(CITIES_DIR, `${c.slug}.json`), JSON.stringify(file) + '\n');

    if (sortedKeys.length === 0) {
      deadCities.push(c.name);
      continue;
    }
    let upcoming = 0;
    for (const k of sortedKeys) if (k >= today) upcoming++;
    if (upcoming < minCoverage) {
      minCoverage = upcoming;
      minCoverageCity = c.name;
    }
  }
  if (!Number.isFinite(minCoverage)) minCoverage = 0;
  const serverStatus: 'ok' | 'warning' =
    minCoverage < COVERAGE_WARN_DAYS ? 'warning' : 'ok';

  // Compact bundled seed: next SEED_DAYS for every city, keyed by slug.
  const seedCities: Record<string, CityDays> = {};
  for (const c of cities) {
    const days = data.get(c.slug)!;
    const window: CityDays = {};
    for (let i = 0; i < SEED_DAYS; i++) {
      const k = addDays(today, i);
      if (days[k]) window[k] = days[k];
    }
    if (Object.keys(window).length > 0) seedCities[c.slug] = window;
  }
  await writeFile(
    SEED_PATH,
    JSON.stringify({ version: 1, builtAt, timezone: TZ, cities: seedCities }) + '\n',
  );

  // Index.
  await writeFile(
    INDEX_PATH,
    JSON.stringify(
      {
        version: 1,
        builtAt,
        timezone: TZ,
        horizonDays: HORIZON_DAYS,
        seedDays: SEED_DAYS,
        minCoverageDays: minCoverage,
        coverageFloorDays: COVERAGE_WARN_DAYS,
        serverStatus,
        deadCities,
        cities: cities.map(c => ({ city: c.name, slug: c.slug })),
      },
      null,
      2,
    ) + '\n',
  );

  console.log(
    `[ifis-dataset] cities=${cities.length} requests=${requests} refreshed=${refreshed} ` +
      `failures=${failures} rejected=${rejected.length} minCoverageDays=${minCoverage} (${minCoverageCity}) ` +
      `status=${serverStatus} dead=${deadCities.length} budgetHit=${budgetHit}`,
  );
  if (rejected.length > 0) {
    // Not fatal: the phone computes those days itself. Listed so a run's
    // log says which days the site is still answering with another year.
    console.warn(
      `[ifis-dataset] ${rejected.length} row(s) rejected — another year's row served for the date:\n  ` +
        rejected.slice(0, 40).join('\n  ') +
        (rejected.length > 40 ? `\n  … and ${rejected.length - 40} more` : ''),
    );
    await emitOutput('rejected_days', String(rejected.length));
  }
  if (deadCities.length > 0) {
    // Not fatal: these coordinates fall back to AlAdhan/on-device at runtime.
    console.warn(
      `[ifis-dataset] no data (widget rejects the name; runtime falls back): ` +
        deadCities.join(', '),
    );
  }

  // Alarms → non-zero exit → workflow emails.
  if (originUnhealthy) {
    console.error(
      `[ifis-dataset] ORIGIN UNHEALTHY: ${failures}/${requests} requests failed ` +
        `(${Math.round(failRate * 100)}%). islamiskaforbundet.se is likely down.`,
    );
    process.exit(2);
  }
  // Hard floor: a real coverage collapse (a month is the minimum we promise).
  if (minCoverage < COVERAGE_FAIL_DAYS) {
    console.error(
      `[ifis-dataset] CRITICAL: "${minCoverageCity}" holds only ${minCoverage} ` +
        `upcoming days (floor ${COVERAGE_FAIL_DAYS}). Below a month — failing.`,
    );
    process.exit(3);
  }
  // Early warning: run stays green, but email so it's fixed before it hits the
  // floor. The warning-email workflow step keys off these outputs.
  if (minCoverage < COVERAGE_WARN_DAYS) {
    console.warn(
      `[ifis-dataset] WARNING: "${minCoverageCity}" holds only ${minCoverage} ` +
        `upcoming days (want ≥ ${COVERAGE_WARN_DAYS}).`,
    );
    await emitOutput('coverage_warning', 'true');
    await emitOutput('min_coverage', String(minCoverage));
    await emitOutput('min_coverage_city', minCoverageCity);
  }
}

main().catch(err => {
  console.error('[ifis-dataset] FATAL', err);
  process.exit(1);
});
