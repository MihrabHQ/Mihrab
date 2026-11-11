/**
 * Kyrgyzstan — the Spiritual Administration of Muslims of Kyrgyzstan's
 * timetable, place by place, from the public API the Administration
 * documents on its own site:
 *
 *   https://muftiyat.kg/ru/calendar/api/
 *   https://muftiyat.kg/ru/api/v1/calendar/<code>/?start=DD-MM-YYYY&end=DD-MM-YYYY
 *
 * A date range of two months at most per request; 115 places
 * (`kmdb-places.ts`), one request each, 300 ms apart. The window kept is a
 * week behind today and fifty-three days ahead (two months in all, the most one request gives): the API answers any date, so
 * there is no year's end to wait for, and the weekly run moves the window
 * on. The timetable prints one Asr, the Hanafi one, and no Imsak — ten
 * minutes before Fajr stand in, as for Singapore.
 *
 *   npx tsx tools/national-tables/kmdb.ts
 */
import { BuildError, addDays, changedPlaces, emitOutput, minutesOf, writeTable, type DayMinutes, type PlaceTable } from './write';
import { KMDB_PLACES } from './kmdb-places';

const ORIGIN = 'https://muftiyat.kg';
const UA = 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)';
const IMSAK_BEFORE_FAJR = 10;
const KEEP_PAST_DAYS = 7;
const DAYS_AHEAD = 53;

type Row = { date: string; fajr: string; sunrise: string; dhuhr: string; asr: string; maghrib: string; isha: string };

/** "31-12-2026" as the API prints it → "2026-12-31". */
export function parseKmdbDate(s: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) throw new BuildError(`not a date of the API's: "${s}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const apiDate = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

export function parseKmdbRange(json: { prayertimes?: Row[] }): Record<string, DayMinutes> {
  if (!Array.isArray(json.prayertimes) || !json.prayertimes.length) {
    throw new BuildError(`the API answered with ${json.prayertimes?.length ?? 'no'} rows`);
  }
  const days: Record<string, DayMinutes> = {};
  for (const r of json.prayertimes) {
    const fajr = minutesOf(r.fajr);
    days[parseKmdbDate(r.date)] = [
      fajr - IMSAK_BEFORE_FAJR, fajr, minutesOf(r.sunrise), minutesOf(r.dhuhr),
      minutesOf(r.asr), minutesOf(r.maghrib), minutesOf(r.isha),
    ];
  }
  return days;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchPlace(code: number, start: string, end: string): Promise<Record<string, DayMinutes>> {
  const url = `${ORIGIN}/ru/api/v1/calendar/${code}/?start=${apiDate(start)}&end=${apiDate(end)}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(300 * attempt);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseKmdbRange((await res.json()) as { prayertimes?: Row[] });
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
  throw new Error('unreachable');
}

async function main(): Promise<number> {
  const today = process.env.TABLE_TODAY ?? new Date().toISOString().slice(0, 10);
  const start = addDays(today, -KEEP_PAST_DAYS);
  const end = addDays(today, DAYS_AHEAD);
  const places: PlaceTable[] = [];
  for (const p of KMDB_PLACES) {
    const days = await fetchPlace(p.id, start, end);
    places.push({ id: p.id, name: p.name, nameEn: p.nameRu, lat: p.lat, lon: p.lon, days });
  }
  console.log(`${places.length} places read, ${start} .. ${end}`);
  const changes = changedPlaces(places, 'kyrgyzstan');
  writeTable(places, {
    id: 'kmdb',
    folder: 'kyrgyzstan',
    seedFile: 'src/providers/data/kmdbSeed.json',
    placesFile: 'src/providers/data/kmdbPlaces.json',
    timezone: 'Asia/Bishkek',
    source: `${ORIGIN}/ru/calendar/api/`,
    warnDays: 21,
    keepPastDays: KEEP_PAST_DAYS,
    // Midwinter Maghrib in the east (Karakol) is before four.
    minMaghrib: 15 * 60 + 30,
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
