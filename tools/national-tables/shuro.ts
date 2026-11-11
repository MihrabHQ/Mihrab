/**
 * Tajikistan — the Islamic Centre of Tajikistan's timetable (the Council of
 * Ulema's site), which is one table for Dushanbe and a note giving eighteen
 * towns as so many minutes before or after it:
 *
 *   https://shuroiulamo.tj/tj/namaz
 *   POST https://shuroiulamo.tj/tj/namaz/ntime  (fmonth=MM&fyear=YYYY&fday=0)
 *
 * A month per request. The table is set year by year (Dhuhr is 12:40 on
 * every day), and a year's last months appear late, so the window runs
 * from a week behind today to the last day the site has: the months from
 * last month to two ahead are asked for, and the ones not published yet
 * are simply absent. Each cell is a range; the start is the prayer's time,
 * and sunrise is the end of Fajr's. One Asr, the Hanafi one; no Imsak —
 * ten minutes before Fajr stand in.
 *
 * The towns' minutes are read from the page's own note on every run and
 * checked against the list here: a town moved or missing stops the build.
 *
 *   npx tsx tools/national-tables/shuro.ts
 */
import { BuildError, addDays, changedPlaces, emitOutput, minutesOf, writeTable, type DayMinutes, type PlaceTable } from './write';

const ORIGIN = 'https://shuroiulamo.tj';
const UA = 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)';
const IMSAK_BEFORE_FAJR = 10;
const KEEP_PAST_DAYS = 7;

/** Dushanbe, and the towns of the page's note: minutes from Dushanbe (negative: earlier). Each at its town centre, for matching a reader to the nearest. */
export const SHURO_PLACES: { id: number; name: string; nameEn: string; lat: number; lon: number; offset: number }[] = [
  { id: 1, name: 'Душанбе', nameEn: 'Dushanbe', lat: 38.56, lon: 68.774, offset: 0 },
  { id: 2, name: 'Истаравшан', nameEn: 'Istaravshan', lat: 39.911, lon: 69.006, offset: -1 },
  { id: 3, name: 'Кӯлоб', nameEn: 'Kulob', lat: 37.912, lon: 69.781, offset: -4 },
  { id: 4, name: 'Хуҷанд', nameEn: 'Khujand', lat: 40.283, lon: 69.622, offset: -3 },
  { id: 5, name: 'Рашт', nameEn: 'Rasht', lat: 39.027, lon: 70.376, offset: -6 },
  { id: 6, name: 'Конибодом', nameEn: 'Konibodom', lat: 40.294, lon: 70.431, offset: -6 },
  { id: 7, name: 'Исфара', nameEn: 'Isfara', lat: 40.126, lon: 70.625, offset: -7 },
  { id: 8, name: 'Ашт', nameEn: 'Asht', lat: 40.668, lon: 70.35, offset: -6 },
  { id: 9, name: 'Хоруғ', nameEn: 'Khorugh', lat: 37.489, lon: 71.553, offset: -11 },
  { id: 10, name: 'Мурғоб', nameEn: 'Murghob', lat: 38.171, lon: 73.965, offset: -20 },
  { id: 11, name: 'Ҳамадонӣ', nameEn: 'Hamadoni', lat: 37.613, lon: 69.631, offset: -3 },
  { id: 12, name: 'Ш. Шоҳин', nameEn: 'Shamsiddin Shohin', lat: 37.843, lon: 70.043, offset: -5 },
  { id: 13, name: 'Муминобод', nameEn: 'Muminobod', lat: 38.108, lon: 70.029, offset: -5 },
  { id: 14, name: 'Бохтар', nameEn: 'Bokhtar', lat: 37.836, lon: 68.78, offset: 4 },
  { id: 15, name: 'Панҷакент', nameEn: 'Panjakent', lat: 39.495, lon: 67.609, offset: 5 },
  { id: 16, name: 'Шаҳритус', nameEn: 'Shahritus', lat: 37.262, lon: 68.138, offset: 3 },
  { id: 17, name: 'Айнӣ', nameEn: 'Ayni', lat: 39.393, lon: 68.541, offset: 1 },
  { id: 18, name: 'Н. Хусрав', nameEn: 'Nosiri Khusrav', lat: 37.21, lon: 68.0, offset: 4 },
  { id: 19, name: 'Турсунзода', nameEn: 'Tursunzoda', lat: 38.511, lon: 68.231, offset: 3 },
];

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** A month's rows: date → the seven times for Dushanbe. */
export function parseShuroMonth(html: string): Record<string, DayMinutes> {
  const days: Record<string, DayMinutes> = {};
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const c = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []).map(td => text(td).trim());
    const d = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(c[1] ?? '');
    if (c.length !== 9 || !d) continue;
    const range = (s: string) => {
      const m = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(s);
      if (!m) throw new BuildError(`${c[1]}: not a range: "${s}"`);
      return [minutesOf(m[1]), minutesOf(m[2])];
    };
    const [fajr, sunrise] = range(c[3]);
    days[`${d[3]}-${d[2]}-${d[1]}`] = [fajr - IMSAK_BEFORE_FAJR, fajr, sunrise, range(c[4])[0], range(c[5])[0], range(c[7])[0], range(c[8])[0]];
  }
  return days;
}

/** The note's towns: name → minutes from Dushanbe (negative: earlier). */
export function parseShuroOffsets(html: string): Record<string, number> {
  const t = text(html);
  const before = /пеш аз вақти шаҳри Душанбе аст:(.*?)\.\s*Шаҳру/.exec(t)?.[1];
  const after = /баъд аз вақти шаҳри Душанбе аст:(.*?)\.\s*(?:©|$)/.exec(t)?.[1];
  if (!before || !after) throw new BuildError('the note on the towns is not on the page');
  const out: Record<string, number> = {};
  const read = (list: string, sign: number) => {
    for (const m of list.matchAll(/([^,]+?)\s*-\s*(\d+)\s*дақиқа/g)) out[m[1].trim()] = sign * Number(m[2]);
  };
  read(before, -1);
  read(after, 1);
  return out;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function get(url: string, body?: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(600 * attempt);
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: { 'User-Agent': UA, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        body,
      });
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
  const offsets = parseShuroOffsets(await get(`${ORIGIN}/tj/namaz`));
  for (const p of SHURO_PLACES.slice(1)) {
    if (offsets[p.name] !== p.offset) throw new BuildError(`${p.nameEn}: the page says ${offsets[p.name] ?? 'nothing'}, the list ${p.offset}`);
  }
  if (Object.keys(offsets).length !== SHURO_PLACES.length - 1) throw new BuildError(`the page lists ${Object.keys(offsets).length} towns, the list ${SHURO_PLACES.length - 1}`);

  const dushanbe: Record<string, DayMinutes> = {};
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  for (let k = -1; k <= 2; k++) {
    const d = new Date(Date.UTC(y, m - 1 + k, 1));
    const month = await get(`${ORIGIN}/tj/namaz/ntime`, `fmonth=${String(d.getUTCMonth() + 1).padStart(2, '0')}&fyear=${d.getUTCFullYear()}&fday=0`).catch(() => '');
    Object.assign(dushanbe, parseShuroMonth(month));
  }
  // The window: from a week back (or the first day held) to the last day in an unbroken run from today.
  if (!dushanbe[today]) throw new BuildError(`no entry for today (${today})`);
  let keepPastDays = 0;
  while (keepPastDays < KEEP_PAST_DAYS && dushanbe[addDays(today, -(keepPastDays + 1))]) keepPastDays++;
  let last = today;
  while (dushanbe[addDays(last, 1)]) last = addDays(last, 1);
  const window: Record<string, DayMinutes> = {};
  for (let d = addDays(today, -keepPastDays); d <= last; d = addDays(d, 1)) window[d] = dushanbe[d];

  const places: PlaceTable[] = SHURO_PLACES.map(p => ({
    id: p.id,
    name: p.name,
    nameEn: p.nameEn,
    lat: p.lat,
    lon: p.lon,
    days: Object.fromEntries(Object.entries(window).map(([d, t]) => [d, t.map(x => x + p.offset) as DayMinutes])),
  }));
  const changes = changedPlaces(places, 'tajikistan');
  writeTable(places, {
    id: 'shuro',
    folder: 'tajikistan',
    seedFile: 'src/providers/data/shuroSeed.json',
    placesFile: 'src/providers/data/shuroPlaces.json',
    timezone: 'Asia/Dushanbe',
    source: `${ORIGIN}/tj/namaz`,
    // A year's last months are published late: warn in the last ten days of what there is.
    warnDays: 10,
    keepPastDays,
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
