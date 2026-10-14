/**
 * Writes a national table the way `src/providers/nationalTable.ts` reads it:
 * `cities/<id>.json` per place, `index.json`, the app's place list and the
 * bundled seed. One writer for every country that publishes a table per
 * place, so a new one is a fetcher and nothing else.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.join(__dirname, '../..');

/** Seven minute counts: Imsak, Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha. */
export type DayMinutes = [number, number, number, number, number, number, number];

export type PlaceTable = {
  id: number;
  name: string;
  nameEn?: string;
  lat: number;
  lon: number;
  /** YYYY-MM-DD → minutes. */
  days: Record<string, DayMinutes>;
};

export type WriteOptions = {
  /** The provider id — the folder under data/prayer-times and the seed's name. */
  id: string;
  folder: string;
  seedFile: string;
  placesFile: string;
  /**
   * What the app matches a reader to, when it is not one point per place:
   * Malaysia's zones are several towns each, all keyed by the zone's id.
   */
  appPlaces?: { id: number; name: string; nameEn?: string; lat: number; lon: number }[];
  timezone: string;
  source: string;
  /** Warn when fewer than this many days are left after today. */
  warnDays: number;
  /** Days before today to keep, so a phone a few days behind still has them. */
  keepPastDays: number;
  today: string;
};

export class BuildError extends Error {}

export function minutesOf(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) throw new BuildError(`not a time: "${hhmm}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Every time in order and within the day — a table with a typo is refused, not published. */
export function checkDay(place: string, date: string, m: DayMinutes): void {
  for (let i = 1; i < m.length; i++) {
    if (!(m[i] > m[i - 1])) {
      throw new BuildError(`${place} ${date}: times out of order (${m.map(clock).join(' ')})`);
    }
  }
  if (m[0] < 0 || m[6] >= 1440) throw new BuildError(`${place} ${date}: outside the day`);
  // Dhuhr near midday and Maghrib after 16:00, anywhere these tables cover.
  if (m[3] < 600 || m[3] > 900 || m[5] < 960) {
    throw new BuildError(`${place} ${date}: implausible (${m.map(clock).join(' ')})`);
  }
}

export function emitOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `${key}=${value}\n`);
}

/** Writes everything; returns the index for the caller's own report. */
export function writeTable(places: PlaceTable[], opt: WriteOptions) {
  const dir = path.join(ROOT, 'data/prayer-times', opt.folder, 'v1');
  const citiesDir = path.join(dir, 'cities');
  fs.mkdirSync(citiesDir, { recursive: true });
  const builtAt = new Date().toISOString();
  const first = addDays(opt.today, -opt.keepPastDays);

  // The window the whole table covers: from `first` to the last day every
  // place has. A place missing a day inside the window stops the build.
  let last = '';
  const ids = new Set<number>();
  for (const p of places) {
    if (ids.has(p.id)) throw new BuildError(`place id ${p.id} twice`);
    ids.add(p.id);
    const dates = Object.keys(p.days).sort();
    if (!dates.length) throw new BuildError(`${p.nameEn ?? p.name}: no days`);
    const placeLast = dates[dates.length - 1];
    last = last ? (placeLast < last ? placeLast : last) : placeLast;
  }
  if (!last || last < opt.today) {
    throw new BuildError(`the table ends ${last || '(empty)'}, before today (${opt.today})`);
  }
  const days = daysBetween(first, last) + 1;

  const keep = new Set<string>();
  const seedCities: Record<string, number[]> = {};
  for (const p of places) {
    const file: Record<string, string[]> = {};
    const flat: number[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) {
      const m = p.days[d];
      if (!m) throw new BuildError(`${p.nameEn ?? p.name}: no entry for ${d}`);
      checkDay(p.nameEn ?? p.name, d, m);
      file[d] = m.map(clock);
      flat.push(...m);
    }
    const out = { id: p.id, city: p.name, timezone: opt.timezone, builtAt, days: file };
    fs.writeFileSync(path.join(citiesDir, `${p.id}.json`), `${JSON.stringify(out)}\n`, 'utf8');
    keep.add(`${p.id}.json`);
    seedCities[String(p.id)] = flat;
  }
  for (const f of fs.readdirSync(citiesDir)) {
    if (f.endsWith('.json') && !keep.has(f)) fs.unlinkSync(path.join(citiesDir, f));
  }

  fs.writeFileSync(
    path.join(ROOT, opt.seedFile),
    `${JSON.stringify({ version: 1, builtAt, timezone: opt.timezone, start: first, days, cities: seedCities })}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(ROOT, opt.placesFile),
    `${JSON.stringify(
      opt.appPlaces ?? places.map(p => ({ id: p.id, name: p.name, nameEn: p.nameEn, lat: p.lat, lon: p.lon })),
      null,
      1,
    )}\n`,
    'utf8',
  );

  const left = daysBetween(opt.today, last);
  const index = {
    version: 1,
    builtAt,
    timezone: opt.timezone,
    source: opt.source,
    serverStatus: left < opt.warnDays ? 'warning' : 'ok',
    firstDate: first,
    lastDate: last,
    minCoverageDays: left,
    deadCities: [] as number[],
    cities: places.map(p => ({ id: p.id, city: p.name, cityEn: p.nameEn })),
  };
  fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  console.log(`${opt.id}: ${places.length} places, ${first} .. ${last} (${left} days left)`);
  emitOutput('coverage_days', String(left));
  emitOutput('places', String(places.length));
  return index;
}

/** Places whose file on disk differs from the new table, for the run's report. */
export function changedPlaces(places: PlaceTable[], folder: string): string[] {
  const citiesDir = path.join(ROOT, 'data/prayer-times', folder, 'v1/cities');
  const out: string[] = [];
  for (const p of places) {
    const file = path.join(citiesDir, `${p.id}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const prev = JSON.parse(fs.readFileSync(file, 'utf8')) as { days: Record<string, string[]> };
      const changed = Object.keys(prev.days)
        .filter(d => p.days[d] && prev.days[d].join() !== p.days[d].map(clock).join())
        .sort();
      if (changed.length) out.push(`${p.nameEn ?? p.name}: ${changed.length} day(s), first ${changed[0]}`);
    } catch {
      /* unreadable: it will be rewritten */
    }
  }
  return out;
}
