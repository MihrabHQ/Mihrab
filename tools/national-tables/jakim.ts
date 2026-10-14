/**
 * Malaysia — JAKIM's e-Solat timetable, zone by zone, from the department's
 * own JSON endpoint (the one its website and widgets read):
 *
 *   https://www.e-solat.gov.my/index.php?r=esolatApi/takwimsolat&period=year&zone=SGR01
 *
 * A year per zone, 59 zones (`jakim-zones.ts`), one request each, 300 ms
 * apart. Dates come as "31-Dis-2026" — Malay month names. The endpoint
 * serves the current year only (a `year` parameter is ignored), so the
 * window always ends on 31 December and the job runs daily in the first
 * week of January to pick the new year up; the phone computes JAKIM's own
 * method for the days in between.
 *
 *   npx tsx tools/national-tables/jakim.ts
 */
import { BuildError, changedPlaces, emitOutput, minutesOf, writeTable, type DayMinutes, type PlaceTable } from './write';
import { JAKIM_ZONES, jakimPlaces } from './jakim-zones';

const ORIGIN = 'https://www.e-solat.gov.my';
const UA = 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)';
const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mac: 3, Apr: 4, Mei: 5, Jun: 6, Jul: 7, Ogos: 8, Sep: 9, Okt: 10, Nov: 11, Dis: 12 };

type Row = { date: string; imsak: string; fajr: string; syuruk: string; dhuhr: string; asr: string; maghrib: string; isha: string };

export function parseJakimDate(s: string): string {
  const m = /^(\d{1,2})-([A-Za-z]+)-(\d{4})$/.exec(s.trim());
  const month = m ? MONTHS[m[2]] : undefined;
  if (!m || !month) throw new BuildError(`not an e-Solat date: "${s}"`);
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function parseJakimYear(json: { prayerTime?: Row[]; status?: string }): Record<string, DayMinutes> {
  if (!Array.isArray(json.prayerTime) || json.prayerTime.length < 300) {
    throw new BuildError(`e-Solat answered ${json.status ?? 'nothing'} with ${json.prayerTime?.length ?? 0} rows`);
  }
  const days: Record<string, DayMinutes> = {};
  for (const r of json.prayerTime) {
    const fajr = minutesOf(r.fajr);
    let imsak = minutesOf(r.imsak);
    // Perlis prints its Imsak equal to Subuh (the state publishes none);
    // the customary ten minutes stand in, as for Singapore.
    if (imsak >= fajr) imsak = fajr - 10;
    days[parseJakimDate(r.date)] = [
      imsak, fajr, minutesOf(r.syuruk), minutesOf(r.dhuhr),
      minutesOf(r.asr), minutesOf(r.maghrib), minutesOf(r.isha),
    ];
  }
  return days;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchZone(code: string): Promise<Record<string, DayMinutes>> {
  const url = `${ORIGIN}/index.php?r=esolatApi/takwimsolat&period=year&zone=${code}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(300 * attempt);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseJakimYear((await res.json()) as { prayerTime?: Row[] });
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
  throw new Error('unreachable');
}

async function main(): Promise<number> {
  const today = process.env.TABLE_TODAY ?? new Date().toISOString().slice(0, 10);
  const places: PlaceTable[] = [];
  for (let i = 0; i < JAKIM_ZONES.length; i++) {
    const z = JAKIM_ZONES[i];
    const days = await fetchZone(z.code);
    const [name, lat, lon] = z.towns[0];
    places.push({ id: i + 1, name: `${z.code} · ${z.towns.map(t => t[0]).join(', ')}`, nameEn: `${name} (${z.code})`, lat, lon, days });
    console.log(`${z.code}: ${Object.keys(days).length} days`);
  }
  const changes = changedPlaces(places, 'malaysia');
  writeTable(places, {
    id: 'jakim',
    folder: 'malaysia',
    seedFile: 'src/providers/data/jakimSeed.json',
    placesFile: 'src/providers/data/jakimPlaces.json',
    appPlaces: jakimPlaces(),
    timezone: 'Asia/Kuala_Lumpur',
    source: ORIGIN,
    // The year ends on 31 December by design; warn only in the last two weeks.
    warnDays: 14,
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
