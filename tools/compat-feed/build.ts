/**
 * The feed earlier versions of the app read, filled from the app's own
 * calculation.
 *
 * Up to 2.31 the app read Sweden's, Morocco's and Algeria's times from files
 * at fixed addresses in this repository (`data/prayer-times/v1`,
 * `…/morocco/v1`, `…/algeria/v1`). Those versions are still installed. The
 * app now computes these authorities itself (their methods and correction
 * lists, from MihrabHQ/mihrab-methods), and this writes, at the same
 * addresses and in the same shape, what the current app computes: each
 * listed place, every day from the first of this month to the end of the
 * third month after. An earlier version then keeps serving the authority's
 * printed minute, as the current one does, instead of falling back.
 *
 *   TZ=Europe/Stockholm npx tsx tools/compat-feed/build.ts sweden
 *   TZ=Etc/GMT          npx tsx tools/compat-feed/build.ts morocco
 *   TZ=Africa/Algiers   npx tsx tools/compat-feed/build.ts algeria
 *
 * TZ is the clock the authority prints in (the calculation formats in the
 * process's own zone, as on the phone); the script refuses another. Files
 * are rewritten only when a day changed (so `builtAt` moves, and earlier
 * versions download, at most when there is something new: the turn of a
 * month, or a renewed correction list).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getIslamiskaForbundetDatasetTimes } from '../../src/providers/islamiskaForbundetDataset';
import { getHabousDatasetTimes } from '../../src/providers/habousDataset';
import { getMarwDatasetTimes } from '../../src/providers/marwDataset';
import ifisCoords from '../../src/providers/islamiskaForbundetCoords.json';
import moroccoCities from '../../src/providers/data/moroccoCities.json';
import algeriaCities from '../../src/providers/data/algeriaCities.json';
import type { PrayerTimesResult } from '../../src/providers/types';

const ROOT = path.join(__dirname, '..', '..');
const MONTHS_AHEAD = 3;

type Tuple = [string, string, string, string, string, string, string];
type Place = { file: string; head: Record<string, unknown>; lat: number; lon: number };
type Feed = {
  dir: string;
  tz: string;
  /** The zone named in the files, as earlier versions expect it. */
  timezone: string;
  places: () => Place[];
  times: (p: { latitude: number; longitude: number; date: Date }) => Promise<PrayerTimesResult>;
  index: (base: { builtAt: string; minCoverageDays: number; firstDate: string; lastDate: string }, places: Place[]) => Record<string, unknown>;
};

/** Islamiska Förbundet's city names as files: the slug earlier versions ask for. */
function citySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[àáâã]/g, 'a')
    .replace(/[å]/g, 'a')
    .replace(/[ä]/g, 'a')
    .replace(/[ö]/g, 'o')
    .replace(/[ø]/g, 'o')
    .replace(/[é]/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const FEEDS: Record<string, Feed> = {
  sweden: {
    dir: 'data/prayer-times/v1',
    tz: 'Europe/Stockholm',
    timezone: 'Europe/Stockholm',
    places: () =>
      Object.entries(ifisCoords as Record<string, { lat: number; lng: number }>).map(([city, c]) => ({
        file: `${citySlug(city)}.json`,
        head: { city, slug: citySlug(city), timezone: 'Europe/Stockholm' },
        lat: c.lat,
        lon: c.lng,
      })),
    times: getIslamiskaForbundetDatasetTimes,
    index: (b, places) => ({
      version: 1,
      builtAt: b.builtAt,
      timezone: 'Europe/Stockholm',
      minCoverageDays: b.minCoverageDays,
      serverStatus: 'ok',
      deadCities: [],
      cities: places.map(p => ({ city: p.head.city, slug: p.head.slug })),
    }),
  },
  morocco: {
    dir: 'data/prayer-times/morocco/v1',
    tz: 'Etc/GMT',
    timezone: 'Africa/Casablanca',
    places: () =>
      (moroccoCities as { id: number; name: string; lat: number | null; lng: number | null }[])
        .filter(c => typeof c.lat === 'number' && typeof c.lng === 'number')
        .map(c => ({ file: `${c.id}.json`, head: { id: c.id, city: c.name, timezone: 'Africa/Casablanca' }, lat: c.lat!, lon: c.lng! })),
    times: getHabousDatasetTimes,
    index: (b, places) => ({
      version: 1,
      builtAt: b.builtAt,
      timezone: 'Africa/Casablanca',
      minCoverageDays: b.minCoverageDays,
      staleCities: 0,
      serverStatus: 'ok',
      deadCities: [],
      cities: places.map(p => ({ id: p.head.id, city: p.head.city })),
    }),
  },
  algeria: {
    dir: 'data/prayer-times/algeria/v1',
    tz: 'Africa/Algiers',
    timezone: 'Africa/Algiers',
    places: () =>
      (algeriaCities as { id: number; name: string; lat: number; lon: number }[]).map(c => ({
        file: `${c.id}.json`,
        head: { id: c.id, city: c.name, timezone: 'Africa/Algiers' },
        lat: c.lat,
        lon: c.lon,
      })),
    times: getMarwDatasetTimes,
    index: (b, places) => ({
      version: 1,
      builtAt: b.builtAt,
      timezone: 'Africa/Algiers',
      serverStatus: 'ok',
      firstDate: b.firstDate,
      lastDate: b.lastDate,
      minCoverageDays: b.minCoverageDays,
      deadCities: [],
      cities: places.map(p => ({ id: p.head.id, city: p.head.city })),
    }),
  },
};

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function main(): Promise<number> {
  const id = process.argv[2] ?? '';
  const feed = FEEDS[id];
  if (!feed) {
    console.error(`usage: TZ=<zone> tsx tools/compat-feed/build.ts ${Object.keys(FEEDS).join('|')}`);
    return 64;
  }
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (process.env.TZ !== feed.tz) {
    console.error(`${id} is printed in ${feed.tz}: run with TZ=${feed.tz} (this process is in ${zone}).`);
    return 64;
  }
  const today = process.env.FEED_TODAY ? new Date(`${process.env.FEED_TODAY}T12:00:00`) : new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD + 1, 0);
  const dates: Date[] = [];
  for (let d = new Date(first); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) dates.push(d);

  const dir = path.join(ROOT, feed.dir);
  const places = feed.places();
  const out = new Map<string, Record<string, Tuple>>();
  for (const p of places) {
    const days: Record<string, Tuple> = {};
    for (const date of dates) {
      const t = (await feed.times({ latitude: p.lat, longitude: p.lon, date })).timings as Record<string, string>;
      days[key(date)] = [t.Imsak, t.Fajr, t.Sunrise, t.Dhuhr, t.Asr, t.Maghrib, t.Isha];
    }
    out.set(p.file, days);
  }

  // Unchanged days, unchanged files: an earlier version downloads only what is new.
  const same = places.every(p => {
    const f = path.join(dir, 'cities', p.file);
    if (!fs.existsSync(f)) return false;
    try {
      return JSON.stringify(JSON.parse(fs.readFileSync(f, 'utf8')).days) === JSON.stringify(out.get(p.file));
    } catch {
      return false;
    }
  });
  if (same) {
    console.log(`${id}: ${places.length} places, ${dates.length} days — unchanged`);
    return 0;
  }

  const builtAt = new Date().toISOString();
  fs.rmSync(path.join(dir, 'cities'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'cities'), { recursive: true });
  for (const p of places) {
    fs.writeFileSync(path.join(dir, 'cities', p.file), JSON.stringify({ ...p.head, builtAt, days: out.get(p.file) }) + '\n');
  }
  const firstDate = key(first);
  const lastDate = key(end);
  const minCoverageDays = Math.round((end.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000) + 1;
  fs.writeFileSync(
    path.join(dir, 'index.json'),
    JSON.stringify(feed.index({ builtAt, minCoverageDays, firstDate, lastDate }, places), null, 2) + '\n',
  );
  console.log(`${id}: ${places.length} places, ${firstDate} → ${lastDate} — written`);
  return 0;
}

main().then(
  code => process.exit(code),
  err => {
    console.error(err);
    process.exit(1);
  },
);
