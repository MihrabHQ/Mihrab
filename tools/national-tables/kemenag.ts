/**
 * Indonesia — the Ministry of Religious Affairs' (Kemenag, Bimas Islam)
 * timetable, per regency or city, from the ministry's own schedule page:
 *
 *   https://bimasislam.kemenag.go.id/jadwalshalat
 *
 * The page's JavaScript posts to /ajax/getShalatbln with a province id, a
 * regency id, a month and a year, and gets the month back as JSON; the ids
 * are the md5 of the province number and the ministry's regency code. The
 * 517 regencies and their ids are in `kemenag-places.json`, read once with
 * the probe workflow and placed on the map with OpenStreetMap's Nominatim.
 *
 * The site does not answer from Sweden (a geographic block, by the look of
 * it) but does from GitHub's runners, so this runs there. A year is 517 ×
 * 12 requests; the window fetched is this month and the next two, which
 * keeps a run at ~1,500 requests and the phones a season ahead.
 *
 *   npx tsx tools/national-tables/kemenag.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { BuildError, changedPlaces, emitOutput, minutesOf, writeTable, type DayMinutes, type PlaceTable } from './write';

const ORIGIN = 'https://bimasislam.kemenag.go.id';
const UA = 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)';
const MONTHS_AHEAD = Number(process.env.KEMENAG_MONTHS ?? 3);

export type KemenagPlace = {
  id: number;
  /** md5 ids the site takes. */
  provId: string;
  kabId: string;
  prov: string;
  name: string;
  lat: number;
  lon: number;
  /** Metres above sea level (SRTM at the point), for the record. */
  heightM?: number;
  /**
   * The ministry's allowance for the horizon, minutes: its highland
   * regencies get four and a half, the rest none, whatever the height —
   * read off its tables (tools/verify-methods, October 2026).
   */
  horizonMin?: number;
};

type MonthResponse = {
  status?: number;
  message?: string;
  prov?: string;
  kabko?: string;
  data?: Record<string, { imsak: string; subuh: string; terbit: string; dzuhur: string; ashar: string; maghrib: string; isya: string }>;
};

export function parseKemenagMonth(json: MonthResponse, place: string): Record<string, DayMinutes> {
  if (json.status !== 1 || !json.data || typeof json.data !== 'object') {
    throw new BuildError(`${place}: ${json.message ?? 'no data'}`);
  }
  const days: Record<string, DayMinutes> = {};
  for (const [date, r] of Object.entries(json.data)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    days[date] = [
      minutesOf(r.imsak), minutesOf(r.subuh), minutesOf(r.terbit), minutesOf(r.dzuhur),
      minutesOf(r.ashar), minutesOf(r.maghrib), minutesOf(r.isya),
    ];
  }
  if (Object.keys(days).length < 28) throw new BuildError(`${place}: only ${Object.keys(days).length} days`);
  return days;
}

export function loadPlaces(): KemenagPlace[] {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'kemenag-places.json'), 'utf8')) as KemenagPlace[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main(): Promise<number> {
  const today = process.env.TABLE_TODAY ?? new Date().toISOString().slice(0, 10);
  const [y0, m0] = today.split('-').map(Number);
  // A session cookie from the page, as the browser would have.
  const page = await fetch(`${ORIGIN}/jadwalshalat`, { headers: { 'User-Agent': UA } });
  if (!page.ok) throw new BuildError(`the page answered HTTP ${page.status}`);
  const cookie = (page.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/).map(c => c.split(';')[0]).join('; ');

  const places: PlaceTable[] = [];
  let requests = 0;
  for (const p of loadPlaces()) {
    const days: Record<string, DayMinutes> = {};
    for (let k = 0; k < MONTHS_AHEAD; k++) {
      const m = ((m0 - 1 + k) % 12) + 1;
      const y = y0 + Math.floor((m0 - 1 + k) / 12);
      let json: MonthResponse | null = null;
      for (let attempt = 1; attempt <= 3 && !json; attempt++) {
        await sleep(250 * attempt);
        requests++;
        try {
          const res = await fetch(`${ORIGIN}/ajax/getShalatbln`, {
            method: 'POST',
            headers: { 'User-Agent': UA, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ x: p.provId, y: p.kabId, bln: String(m), thn: String(y) }).toString(),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          json = (await res.json()) as MonthResponse;
        } catch (e) {
          if (attempt === 3) throw e;
        }
      }
      Object.assign(days, parseKemenagMonth(json!, p.name));
      // The site's own name for the place must be the one asked for — the
      // ids are md5 hashes of a list position, and a reordered list would
      // silently hand every regency its neighbour's table. The site prints
      // some names longer than its select does ("KAB. ADMINISTRASI
      // KEPULAUAN SERIBU" for "KAB. KEPULAUAN SERIBU"), so one containing
      // the other, word for word, is the same place.
      const answered = (json!.kabko ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
      const asked = p.name.toUpperCase().replace(/\s+/g, ' ');
      const sameWords = (x: string, y: string) => {
        const a = x.split(' ');
        const b = y.split(' ');
        return a.length >= b.length ? b.every(w => a.includes(w)) : a.every(w => b.includes(w));
      };
      if (answered && answered !== asked && !sameWords(answered, asked)) {
        throw new BuildError(`${p.name}: the site answered for "${json!.kabko}" — the id list is stale`);
      }
    }
    places.push({ id: p.id, name: p.name, nameEn: `${p.name} (${p.prov})`, lat: p.lat, lon: p.lon, heightM: p.heightM, horizonMin: p.horizonMin, days });
    if (places.length % 50 === 0) console.log(`${places.length} places, ${requests} requests`);
  }
  const changes = changedPlaces(places, 'indonesia');
  writeTable(places, {
    id: 'kemenag',
    folder: 'indonesia',
    seedFile: 'src/providers/data/kemenagSeed.json',
    placesFile: 'src/providers/data/kemenagPlaces.json',
    timezone: 'Asia/Jakarta',
    source: `${ORIGIN}/jadwalshalat`,
    warnDays: 21,
    keepPastDays: 7,
    today,
  });
  if (changes.length) console.log(`changed against the previous build:\n  ${changes.join('\n  ')}`);
  emitOutput('changed_places', String(changes.length));
  return 0;
}

if (require.main === module) {
  main()
    .then(c => process.exit(c))
    .catch(e => {
      console.error(e instanceof BuildError ? `refused: ${e.message}` : e);
      process.exit(3);
    });
}
