/**
 * Dagestan — the Muftiate of the Republic of Dagestan's timetable, as its
 * own site (islamdag.ru) serves it: a file per place,
 *
 *   https://islamdag.ru/json/namaz/<place>.json
 *
 * of 365 rows — Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha — with no year: the
 * same table every year, read by the day of the year. The site allows
 * copying with a link to it; the app names it as the source and
 * `docs/prayer-times-sources.md` links it.
 *
 * A row is a day of an ordinary year; 29 February is given 28 February's.
 * The window runs from a week behind today to four months ahead and moves
 * on with each weekly run. One Asr, the first (the Muftiate follows the
 * Shafi'i school); no Imsak — ten minutes before Fajr stand in.
 *
 * A file that is not 365 rows of six times in order stops the build; a time
 * printed without its colon ("0252") is read as what it plainly is, and
 * said in the log.
 *
 *   npx tsx tools/national-tables/dagestan.ts
 */
import { BuildError, addDays, changedPlaces, emitOutput, writeTable, type DayMinutes, type PlaceTable } from './write';

const ORIGIN = 'https://islamdag.ru';
const UA = 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)';
const IMSAK_BEFORE_FAJR = 10;
const KEEP_PAST_DAYS = 7;
const DAYS_AHEAD = 120;
const KEYS = ['namaz_1', 'voshod', 'namaz_2', 'namaz_3', 'namaz_4', 'namaz_5'] as const;

/** The site's places, in its own order, each at its town (a district's at its seat), for matching a reader to the nearest. */
export const DAGESTAN_PLACES: { id: number; file: string; name: string; nameEn: string; lat: number; lon: number }[] = [
  { id: 1, file: 'mahashkala', name: 'Махачкала', nameEn: 'Makhachkala', lat: 42.983, lon: 47.504 },
  { id: 2, file: 'agul', name: 'Агул', nameEn: 'Agul', lat: 41.787, lon: 47.596 },
  { id: 3, file: 'ahti', name: 'Ахты', nameEn: 'Akhty', lat: 41.464, lon: 47.74 },
  { id: 4, file: 'ahvah', name: 'Ахвах', nameEn: 'Akhvakh', lat: 42.594, lon: 46.342 },
  { id: 5, file: 'babayurt', name: 'Бабаюрт', nameEn: 'Babayurt', lat: 43.6, lon: 46.779 },
  { id: 6, file: 'botlih', name: 'Ботлих', nameEn: 'Botlikh', lat: 42.665, lon: 46.22 },
  { id: 7, file: 'buynaksk', name: 'Буйнакск', nameEn: 'Buynaksk', lat: 42.819, lon: 47.119 },
  { id: 8, file: 'cumada', name: 'Цумада', nameEn: 'Tsumada', lat: 42.54, lon: 46.122 },
  { id: 9, file: 'dagogni', name: 'Даг-Огни', nameEn: 'Dagestanskiye Ogni', lat: 42.115, lon: 48.194 },
  { id: 10, file: 'derbent', name: 'Дербент', nameEn: 'Derbent', lat: 42.058, lon: 48.289 },
  { id: 11, file: 'gergebil', name: 'Гергебиль', nameEn: 'Gergebil', lat: 42.502, lon: 47.066 },
  { id: 12, file: 'gumbet', name: 'Гумбет', nameEn: 'Gumbet', lat: 42.777, lon: 46.493 },
  { id: 13, file: 'hasavyurt', name: 'Хасавюрт', nameEn: 'Khasavyurt', lat: 43.251, lon: 46.588 },
  { id: 14, file: 'hunzah', name: 'Хунзах', nameEn: 'Khunzakh', lat: 42.541, lon: 46.705 },
  { id: 15, file: 'izberbash', name: 'Избербаш', nameEn: 'Izberbash', lat: 42.565, lon: 47.864 },
  { id: 16, file: 'kaspiysk', name: 'Каспийск', nameEn: 'Kaspiysk', lat: 42.881, lon: 47.638 },
  { id: 17, file: 'kazbek', name: 'Дылым', nameEn: 'Dylym', lat: 43.073, lon: 46.635 },
  { id: 18, file: 'kizilurt', name: 'Кизилюрт', nameEn: 'Kizilyurt', lat: 43.204, lon: 46.867 },
  { id: 19, file: 'kizlyar', name: 'Кизляр', nameEn: 'Kizlyar', lat: 43.848, lon: 46.714 },
  { id: 20, file: 'kurah', name: 'Курах', nameEn: 'Kurakh', lat: 41.585, lon: 47.782 },
  { id: 21, file: 'levashi', name: 'Леваши', nameEn: 'Levashi', lat: 42.431, lon: 47.323 },
  { id: 22, file: 'rutul', name: 'Рутул', nameEn: 'Rutul', lat: 41.535, lon: 47.424 },
  { id: 23, file: 'shamilkala', name: 'Шамилькала', nameEn: 'Shamilkala', lat: 42.688, lon: 46.866 },
  { id: 24, file: 'sharoda', name: 'Чарода', nameEn: 'Charoda', lat: 42.238, lon: 46.836 },
  { id: 25, file: 'suhokumsk', name: 'Южно-Сухокумск', nameEn: 'Yuzhno-Sukhokumsk', lat: 44.66, lon: 45.65 },
  { id: 26, file: 'tlarata', name: 'Тлярата', nameEn: 'Tlyarata', lat: 42.106, lon: 46.354 },
  { id: 27, file: 'unsukul', name: 'Унцукуль', nameEn: 'Untsukul', lat: 42.711, lon: 46.786 },
];

/** "05:42" → minutes; "0252", a colon dropped, the same. */
export function clockOf(s: unknown, where: string, notes: string[]): number {
  const t = String(s ?? '').trim();
  let m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) {
    m = /^(\d{2})(\d{2})$/.exec(t);
    if (m) notes.push(`${where}: "${t}" read as ${m[1]}:${m[2]}`);
  }
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new BuildError(`${where}: not a time: "${t}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** A place's file: 365 rows of the seven times (Imsak standing ten minutes before Fajr), by the day of an ordinary year. */
export function parseDagestanYear(json: string, place: string, notes: string[] = []): DayMinutes[] {
  const rows = JSON.parse(json) as Record<string, unknown>[];
  if (!Array.isArray(rows) || rows.length !== 365) throw new BuildError(`${place}: ${Array.isArray(rows) ? rows.length : 'no'} rows, not 365`);
  return rows.map((r, i) => {
    const t = KEYS.map(k => clockOf(r[k], `${place} day ${i + 1} ${k}`, notes));
    if (!t.every((x, j) => j === 0 || x > t[j - 1])) throw new BuildError(`${place} day ${i + 1}: times out of order`);
    return [t[0] - IMSAK_BEFORE_FAJR, ...t] as DayMinutes;
  });
}

/** The row of a date: the day of an ordinary year, 29 February taking 28 February's. */
export function dagestanRowOf(date: string): number {
  const month = Number(date.slice(5, 7));
  const day = month === 2 && date.slice(8) === '29' ? 28 : Number(date.slice(8));
  return Math.round((Date.UTC(2023, month - 1, day) - Date.UTC(2023, 0, 1)) / 86_400_000);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function get(url: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(1200 * attempt);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
  throw new Error('unreachable');
}

async function main(): Promise<number> {
  const today = process.env.TABLE_TODAY ?? new Date().toISOString().slice(0, 10);
  const notes: string[] = [];
  const places: PlaceTable[] = [];
  for (const p of DAGESTAN_PLACES) {
    const year = parseDagestanYear(await get(`${ORIGIN}/json/namaz/${p.file}.json`), p.nameEn, notes);
    const days: Record<string, DayMinutes> = {};
    for (let d = addDays(today, -KEEP_PAST_DAYS); d <= addDays(today, DAYS_AHEAD); d = addDays(d, 1)) days[d] = year[dagestanRowOf(d)];
    places.push({ id: p.id, name: p.name, nameEn: p.nameEn, lat: p.lat, lon: p.lon, days });
  }
  if (notes.length) console.log(`read with a note:\n  ${notes.join('\n  ')}`);
  const changes = changedPlaces(places, 'dagestan');
  writeTable(places, {
    id: 'dagestan',
    folder: 'dagestan',
    seedFile: 'src/providers/data/dagestanSeed.json',
    placesFile: 'src/providers/data/dagestanPlaces.json',
    timezone: 'Europe/Moscow',
    source: `${ORIGIN}/vremya-namaza/mahachkala`,
    warnDays: 30,
    keepPastDays: KEEP_PAST_DAYS,
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
