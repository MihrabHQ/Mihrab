/**
 * London — the London Unified Prayer Timetable, the one timetable the
 * city's main mosques agreed on (the East London Mosque, the London Central
 * Mosque and others), from londonprayertimes.com's API:
 *
 *   https://www.londonprayertimes.com/api/
 *
 * The API needs a key (free, on request); the job reads it from the
 * `LONDON_PRAYER_TIMES_KEY` secret and never prints it. A month per
 * request, the current year only — the new year appears in December or
 * early January, and is added as soon as the API has it.
 *
 * The timetable prints two Asr times: the first (one shadow length) and
 * the second (two, the Hanafi one). The table format has one Asr per day,
 * so London is written as two places at the same point — 1 with the first
 * Asr, 2 with the second — and the app takes the one the reader's school
 * asks for. The timetable prints no Imsak; ten minutes before Fajr stand
 * in, as for Singapore.
 *
 *   LONDON_PRAYER_TIMES_KEY=… npx tsx tools/national-tables/london.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { BuildError, ROOT, changedPlaces, emitOutput, minutesOf, writeTable, type DayMinutes, type PlaceTable } from './write';

const API = 'https://www.londonprayertimes.com/api/times/';
const UA = 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)';
const IMSAK_BEFORE_FAJR = 10;
const KEEP_PAST_DAYS = 7;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Charing Cross: the timetable is one for the whole city. */
export const LONDON = { name: 'London', nameEn: 'London', lat: 51.5074, lon: -0.1278 };

type Row = { date?: string; fajr?: string; sunrise?: string; dhuhr?: string; asr?: string; asr_2?: string; magrib?: string; isha?: string };

/** A month of the API's answer: each day's times with the first Asr and with the second. */
export function parseLondonMonth(json: { times?: Record<string, Row> }): { first: Record<string, DayMinutes>; second: Record<string, DayMinutes> } {
  const first: Record<string, DayMinutes> = {};
  const second: Record<string, DayMinutes> = {};
  for (const [key, r] of Object.entries(json.times ?? {})) {
    const date = (r.date ?? key).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!r.fajr || !r.sunrise || !r.dhuhr || !r.asr || !r.asr_2 || !r.magrib || !r.isha) {
      throw new BuildError(`${date}: a time is missing`);
    }
    const fajr = minutesOf(r.fajr);
    const head = [fajr - IMSAK_BEFORE_FAJR, fajr, minutesOf(r.sunrise), minutesOf(r.dhuhr)] as const;
    const tail = [minutesOf(r.magrib), minutesOf(r.isha)] as const;
    first[date] = [...head, minutesOf(r.asr), ...tail];
    second[date] = [...head, minutesOf(r.asr_2), ...tail];
  }
  return { first, second };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One month, or null where the API has no such month yet (next year's, before it is published). */
async function fetchMonth(key: string, year: number, month: number): Promise<ReturnType<typeof parseLondonMonth> | null> {
  const url = `${API}?format=json&key=${encodeURIComponent(key)}&year=${year}&month=${MONTHS[month]}&24hours=true`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(500 * attempt);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let json: { times?: Record<string, Row> };
      try {
        json = JSON.parse(text);
      } catch {
        return null; // a short plain-text answer: no such month
      }
      const parsed = parseLondonMonth(json);
      return Object.keys(parsed.first).length ? parsed : null;
    } catch (e) {
      // The URL carries the key: report the reason, never the request.
      if (attempt === 3) throw new BuildError(`londonprayertimes.com ${year}-${month + 1}: ${e instanceof BuildError ? e.message : (e as Error).name}`);
    }
  }
  return null;
}

/** The days the last build wrote, for the week kept behind today across a new year. */
function previousDays(id: number): Record<string, DayMinutes> {
  try {
    const file = path.join(ROOT, 'data/prayer-times/london/v1/cities', `${id}.json`);
    const prev = JSON.parse(fs.readFileSync(file, 'utf8')) as { days: Record<string, string[]> };
    return Object.fromEntries(Object.entries(prev.days).map(([d, t]) => [d, t.map(minutesOf) as DayMinutes]));
  } catch {
    return {};
  }
}

async function main(): Promise<number> {
  const key = process.env.LONDON_PRAYER_TIMES_KEY;
  if (!key) throw new BuildError('LONDON_PRAYER_TIMES_KEY is not set');
  const today = process.env.TABLE_TODAY ?? new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const first: Record<string, DayMinutes> = previousDays(1);
  const second: Record<string, DayMinutes> = previousDays(2);
  let months = 0;
  for (let m = 0; m < 12; m++) {
    const got = await fetchMonth(key, year, m);
    if (!got) throw new BuildError(`no ${MONTHS[m]} ${year}`);
    Object.assign(first, got.first);
    Object.assign(second, got.second);
    months++;
  }
  // Next year's months, from December on, as far as they are published.
  if (today.slice(5, 7) === '12') {
    for (let m = 0; m < 12; m++) {
      const got = await fetchMonth(key, year + 1, m).catch(() => null);
      if (!got) break;
      Object.assign(first, got.first);
      Object.assign(second, got.second);
      months++;
    }
  }
  console.log(`${months} months read`);
  // A new year's first week: without last year's days on disk the window starts today.
  const wanted = new Date(`${today}T00:00:00Z`);
  let keepPastDays = 0;
  for (; keepPastDays < KEEP_PAST_DAYS; keepPastDays++) {
    wanted.setUTCDate(wanted.getUTCDate() - 1);
    const d = wanted.toISOString().slice(0, 10);
    if (!first[d] || !second[d]) break;
  }
  const places: PlaceTable[] = [
    { id: 1, ...LONDON, days: first },
    { id: 2, ...LONDON, days: second },
  ];
  const changes = changedPlaces(places, 'london');
  writeTable(places, {
    id: 'london',
    folder: 'london',
    seedFile: 'src/providers/data/londonSeed.json',
    placesFile: 'src/providers/data/londonPlaces.json',
    timezone: 'Europe/London',
    source: 'https://www.londonprayertimes.com',
    // The year ends on 31 December by design; warn only in the last two weeks.
    warnDays: 14,
    keepPastDays,
    // Midwinter Maghrib is before four in London.
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
      console.error(e instanceof BuildError ? `refused: ${e.message}` : 'failed');
      process.exit(3);
    });
}
