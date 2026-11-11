/**
 * Bashkortostan — the timetable of the Spiritual Administration of Muslims
 * of the Republic of Bashkortostan (DUM RB), as its own site (dumrb.com)
 * reads it: an open interface, a month a place,
 *
 *   https://api.dumrb.com/Prayer/GetByCity?cityName=<place>&year=<y>&month=<m>
 *
 * with, per day, the end of sahur, Fajr, sunrise, Dhuhr, the zenith, Asr,
 * Maghrib and Isha. The interface has no key and no terms against reuse; the
 * app names the Administration as the source and
 * `docs/prayer-times-sources.md` links it.
 *
 * As printed: Imsak is the end of sahur, Fajr the Administration's own
 * (about a quarter of an hour later), Dhuhr its Dhuhr — a fixed clock time
 * (13:30; 13:35 while the zenith is that late), not the zenith — and Asr
 * the one it prints, the Hanafi one. Nothing is corrected: where its
 * sunrise is earlier than the sun's (Ufa, mid-August to mid-November) it
 * is the Administration's sunrise that is served.
 *
 * The window runs from a week behind today to three months ahead and moves
 * on with each weekly run; a month the Administration has not published
 * yet (the next year's, in the autumn) ends a place's days there. A month
 * that is not a row a day of seven times in order stops the build. A place
 * the Administration lists without a month Ufa has is left out of that
 * build and named in the log.
 *
 *   npx tsx tools/national-tables/bashkortostan.ts
 */
import { BuildError, addDays, changedPlaces, emitOutput, writeTable, type DayMinutes, type PlaceTable } from './write';

const API = 'https://api.dumrb.com';
const UA = 'Mihrab dataset builder (+https://github.com/MihrabHQ/Mihrab; mihrab@elghamri.se)';
const KEEP_PAST_DAYS = 7;
const DAYS_AHEAD = 92;
/** Ufa: asked first, and its months are the window. */
const FIRST_PLACE_ID = 1;
/** More places than this without a month Ufa has, and the build stops: that is the interface failing, not a village's gap. */
const MAX_LEFT_OUT = 8;
const KEYS = ['suhurDo', 'fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

/**
 * The Administration's places with the coordinates its interface gives
 * them, by its own ids: `api` is the name the interface is asked by, `name`
 * the town or village itself (a district's is its seat).
 */
export const BASHKORTOSTAN_PLACES: { id: number; api: string; name: string; nameEn: string; lat: number; lon: number }[] = [
  { id: 1, api: 'Уфа', name: 'Уфа', nameEn: 'Ufa', lat: 54.7352, lon: 55.9587 },
  { id: 2, api: 'Бирск', name: 'Бирск', nameEn: 'Birsk', lat: 55.4175, lon: 55.5307 },
  { id: 5, api: 'Агидель', name: 'Агидель', nameEn: 'Agidel', lat: 55.899, lon: 53.9334 },
  { id: 6, api: 'Баймак', name: 'Баймак', nameEn: 'Baymak', lat: 52.5912, lon: 58.3112 },
  { id: 7, api: 'Белебей', name: 'Белебей', nameEn: 'Belebey', lat: 54.1112, lon: 54.1034 },
  { id: 8, api: 'Белорецк', name: 'Белорецк', nameEn: 'Beloretsk', lat: 53.9592, lon: 58.3904 },
  { id: 9, api: 'Благовещенск', name: 'Благовещенск', nameEn: 'Blagoveshchensk', lat: 55.0311, lon: 55.9818 },
  { id: 10, api: 'Давлеканово', name: 'Давлеканово', nameEn: 'Davlekanovo', lat: 54.2227, lon: 55.0312 },
  { id: 11, api: 'Дюртюли', name: 'Дюртюли', nameEn: 'Dyurtyuli', lat: 54.868, lon: 55.494 },
  { id: 12, api: 'Ишимбай', name: 'Ишимбай', nameEn: 'Ishimbay', lat: 53.4546, lon: 56.044 },
  { id: 13, api: 'с. Кармаскалы Кармаскалинский район', name: 'Кармаскалы', nameEn: 'Karmaskaly', lat: 54.3627, lon: 56.1593 },
  { id: 14, api: 'Кумертау', name: 'Кумертау', nameEn: 'Kumertau', lat: 52.7565, lon: 55.7969 },
  { id: 15, api: 'Межгорье', name: 'Межгорье', nameEn: 'Mezhgorye', lat: 54.2373, lon: 57.947 },
  { id: 16, api: 'Мелеуз', name: 'Мелеуз', nameEn: 'Meleuz', lat: 52.9589, lon: 55.9283 },
  { id: 17, api: 'Миловка', name: 'Миловка', nameEn: 'Milovka', lat: 55.8253, lon: 54.7783 },
  { id: 18, api: 'Нефтекамск', name: 'Нефтекамск', nameEn: 'Neftekamsk', lat: 56.0992, lon: 54.2615 },
  { id: 19, api: 'Октябрьский', name: 'Октябрьский', nameEn: 'Oktyabrsky', lat: 54.452, lon: 53.3381 },
  { id: 20, api: 'Приютово', name: 'Приютово', nameEn: 'Priyutovo', lat: 53.9315, lon: 53.9033 },
  { id: 21, api: 'Салават', name: 'Салават', nameEn: 'Salavat', lat: 53.3616, lon: 55.9245 },
  { id: 22, api: 'Сибай', name: 'Сибай', nameEn: 'Sibay', lat: 52.7204, lon: 58.6657 },
  { id: 23, api: 'Стерлитамак', name: 'Стерлитамак', nameEn: 'Sterlitamak', lat: 53.6323, lon: 55.9522 },
  { id: 24, api: 'Туймазы', name: 'Туймазы', nameEn: 'Tuymazy', lat: 54.5999, lon: 53.6949 },
  { id: 25, api: 'Учалы', name: 'Учалы', nameEn: 'Uchaly', lat: 54.3191, lon: 59.3785 },
  { id: 26, api: 'п.г.т. Чишмы Чишминский район', name: 'Чишмы', nameEn: 'Chishmy', lat: 54.5893, lon: 55.3803 },
  { id: 27, api: 'Янаул', name: 'Янаул', nameEn: 'Yanaul', lat: 56.2713, lon: 54.9331 },
  { id: 32, api: 'с. Аскарово Абзелиловский район', name: 'Аскарово', nameEn: 'Askarovo', lat: 53.3363, lon: 58.5115 },
  { id: 33, api: 'с. Раевский Альшеевский район', name: 'Раевский', nameEn: 'Rayevsky', lat: 54.0649, lon: 54.9328 },
  { id: 34, api: 'с. Архангельское Архангельский район', name: 'Архангельское', nameEn: 'Arkhangelskoye', lat: 54.4061, lon: 56.7811 },
  { id: 35, api: 'с. Аскино Аскинский район', name: 'Аскино', nameEn: 'Askino', lat: 56.0896, lon: 56.5814 },
  { id: 36, api: 'с. Толбазы Аургазинский район', name: 'Толбазы', nameEn: 'Tolbazy', lat: 54.0134, lon: 55.8889 },
  { id: 37, api: 'с. Бакалы Бакалинский район', name: 'Бакалы', nameEn: 'Bakaly', lat: 55.1796, lon: 53.7955 },
  { id: 38, api: 'с. Старобалтачево Балтачевский район', name: 'Старобалтачево', nameEn: 'Starobaltachevo', lat: 56.0008, lon: 55.9179 },
  { id: 39, api: 'с. Новобелокатай Белокатайский район', name: 'Новобелокатай', nameEn: 'Novobelokatay', lat: 55.7077, lon: 58.9591 },
  { id: 40, api: 'с. Бижбуляк Бижбулякский район', name: 'Бижбуляк', nameEn: 'Bizhbulyak', lat: 53.6925, lon: 54.2696 },
  { id: 41, api: 'с. Языково Благоварский район', name: 'Языково', nameEn: 'Yazykovo', lat: 54.6882, lon: 55.0216 },
  { id: 42, api: 'с. Буздяк Буздякский район', name: 'Буздяк', nameEn: 'Buzdyak', lat: 54.5705, lon: 54.534 },
  { id: 43, api: 'с. Бураево Бураевский район', name: 'Бураево', nameEn: 'Burayevo', lat: 55.8369, lon: 55.4104 },
  { id: 44, api: 'с. Старосубхангулово Бурзянский район', name: 'Старосубхангулово', nameEn: 'Starosubkhangulovo', lat: 53.1021, lon: 57.4416 },
  { id: 45, api: 'с. Красноусольский Гафурийский район', name: 'Красноусольский', nameEn: 'Krasnousolsky', lat: 53.8883, lon: 56.4736 },
  { id: 46, api: 'с. Месягутово Дуванский район', name: 'Месягутово', nameEn: 'Mesyagutovo', lat: 55.5378, lon: 58.2412 },
  { id: 47, api: 'с. Ермекеево Ермекеевский район', name: 'Ермекеево', nameEn: 'Yermekeyevo', lat: 54.0769, lon: 53.6701 },
  { id: 48, api: 'с. Исянгулово Зианчуринский район', name: 'Исянгулово', nameEn: 'Isyangulovo', lat: 52.1896, lon: 56.5824 },
  { id: 49, api: 'с. Зилаир Зилаирский район', name: 'Зилаир', nameEn: 'Zilair', lat: 52.2335, lon: 57.4424 },
  { id: 50, api: 'с. Иглино Иглинский район', name: 'Иглино', nameEn: 'Iglino', lat: 54.8237, lon: 56.4099 },
  { id: 51, api: 'с. Верхнеяркеево Илишевский район', name: 'Верхнеяркеево', nameEn: 'Verkhneyarkeyevo', lat: 55.4514, lon: 54.309 },
  { id: 52, api: 'с. Калтасы Калтасинский район', name: 'Калтасы', nameEn: 'Kaltasy', lat: 55.9693, lon: 54.8009 },
  { id: 53, api: 'с. Караидель Караидельский район', name: 'Караидель', nameEn: 'Karaidel', lat: 55.8327, lon: 56.9131 },
  { id: 54, api: 'с. Верхние Киги Кигинский район', name: 'Верхние Киги', nameEn: 'Verkhniye Kigi', lat: 55.4075, lon: 58.6002 },
  { id: 55, api: 'с. Николо-Березовка Краснокамский район', name: 'Николо-Березовка', nameEn: 'Nikolo-Berezovka', lat: 56.1281, lon: 54.1717 },
  { id: 56, api: 'с. Мраково Кугарчинский район', name: 'Мраково', nameEn: 'Mrakovo', lat: 52.7173, lon: 56.6231 },
  { id: 57, api: 'с. Кушнаренково Кушнаренковский район', name: 'Кушнаренково', nameEn: 'Kushnarenkovo', lat: 55.107, lon: 55.342 },
  { id: 58, api: 'с. Ермолаево Куюргазинский район', name: 'Ермолаево', nameEn: 'Yermolayevo', lat: 52.7028, lon: 55.8349 },
  { id: 59, api: 'с. Большеустьикинское Мечетлинский район', name: 'Большеустьикинское', nameEn: 'Bolsheustyikinskoye', lat: 55.9426, lon: 58.2751 },
  { id: 60, api: 'с. Мишкино Мишкинский район', name: 'Мишкино', nameEn: 'Mishkino', lat: 55.534, lon: 55.9611 },
  { id: 61, api: 'с. Киргиз-Мияки Миякинский район', name: 'Киргиз-Мияки', nameEn: 'Kirgiz-Miyaki', lat: 53.6299, lon: 54.7962 },
  { id: 62, api: 'с. Красная Горка Нуримановский район', name: 'Красная Горка', nameEn: 'Krasnaya Gorka', lat: 55.1955, lon: 56.6739 },
  { id: 63, api: 'с. Стерлибашево Стерлибашевский район', name: 'Стерлибашево', nameEn: 'Sterlibashevo', lat: 53.4378, lon: 55.2543 },
  { id: 64, api: 'с. Верхние Татышлы Татышлинский район', name: 'Верхние Татышлы', nameEn: 'Verkhniye Tatyshly', lat: 56.29, lon: 55.8562 },
  { id: 65, api: 'с. Федоровка Фёдоровский район', name: 'Федоровка', nameEn: 'Fyodorovka', lat: 53.1787, lon: 55.188 },
  { id: 66, api: 'с. Акъяр Хайбуллинский район', name: 'Акъяр', nameEn: 'Akyar', lat: 51.8637, lon: 58.2171 },
  { id: 67, api: 'с. Чекмагуш Чекмагушевский район', name: 'Чекмагуш', nameEn: 'Chekmagush', lat: 55.1406, lon: 54.6476 },
  { id: 68, api: 'с. Шаран Шаранский район', name: 'Шаран', nameEn: 'Sharan', lat: 54.82, lon: 54.0057 },
  { id: 69, api: 'с. Малояз Салаватский район', name: 'Малояз', nameEn: 'Maloyaz', lat: 55.1804, lon: 58.1459 },
];

function clockOf(s: unknown, where: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new BuildError(`${where}: not a time: "${String(s)}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** A place's month as the interface gives it: date → the seven times, a row a day of the month. */
export function parseBashkortostanMonth(json: string, place: string, year: number, month: number): Record<string, DayMinutes> {
  const body = JSON.parse(json) as { year?: number; month?: number; prayerTimes?: Record<string, unknown>[] };
  const rows = body.prayerTimes;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  if (body.year !== year || body.month !== month) throw new BuildError(`${place} ${ym}: answered for ${body.year}-${body.month}`);
  if (!Array.isArray(rows) || rows.length !== daysInMonth) throw new BuildError(`${place} ${ym}: ${Array.isArray(rows) ? rows.length : 'no'} rows, not ${daysInMonth}`);
  const out: Record<string, DayMinutes> = {};
  rows.forEach((r, i) => {
    const date = `${ym}-${String(i + 1).padStart(2, '0')}`;
    const t = KEYS.map(k => clockOf(r[k], `${place} ${date} ${k}`));
    // the end of sahur may be Fajr's own minute; the rest are strictly in order
    if (!(t[0] <= t[1]) || !t.every((x, j) => j < 2 || x > t[j - 1])) throw new BuildError(`${place} ${date}: times out of order`);
    out[date] = t as DayMinutes;
  });
  return out;
}

/** The months (year, month 1-based) a window of dates touches, in order. */
export function monthsOf(from: string, to: string): [number, number][] {
  const out: [number, number][] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push([y, m]);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** The month's body, or null where the Administration has not published it (its 404 says so). */
async function getMonth(api: string, year: number, month: number): Promise<string | null> {
  const url = `${API}/Prayer/GetByCity?cityName=${encodeURIComponent(api)}&year=${year}&month=${month}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(1000 * attempt);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 404) {
        const said = await res.text();
        if (/не найдена/.test(said)) return null;
        throw new BuildError(`${api}: ${said.slice(0, 200)}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (e instanceof BuildError || attempt === 3) throw e;
    }
  }
  throw new Error('unreachable');
}

async function main(): Promise<number> {
  const today = process.env.TABLE_TODAY ?? new Date().toISOString().slice(0, 10);
  const from = addDays(today, -KEEP_PAST_DAYS);
  const to = addDays(today, DAYS_AHEAD);
  const unpublished = new Set<string>();
  const leftOut: string[] = [];
  const places: PlaceTable[] = [];
  for (const p of BASHKORTOSTAN_PLACES) {
    const days: Record<string, DayMinutes> = {};
    let whole = true;
    for (const [y, m] of monthsOf(from, to)) {
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      // Ufa, the first place, says how far the Administration has published
      if (unpublished.has(ym)) break;
      const body = await getMonth(p.api, y, m);
      if (body === null) {
        if (p.id !== FIRST_PLACE_ID) {
          // a place without a month Ufa has is left out of this build, not served with a gap
          leftOut.push(`${p.nameEn} (${ym})`);
          whole = false;
        } else if (ym <= today.slice(0, 7)) {
          throw new BuildError(`${p.nameEn}: ${ym} is not published`);
        } else {
          unpublished.add(ym);
        }
        break;
      }
      for (const [date, t] of Object.entries(parseBashkortostanMonth(body, p.nameEn, y, m))) if (date >= from && date <= to) days[date] = t;
    }
    if (whole) places.push({ id: p.id, name: p.name, nameEn: p.nameEn, lat: p.lat, lon: p.lon, days });
  }
  if (unpublished.size) console.log(`not published yet: ${[...unpublished].join(', ')}`);
  if (leftOut.length) console.log(`left out, a month missing: ${leftOut.join(', ')}`);
  if (leftOut.length > MAX_LEFT_OUT) throw new BuildError(`${leftOut.length} places lack a month Ufa has`);
  const changes = changedPlaces(places, 'bashkortostan');
  writeTable(places, {
    id: 'bashkortostan',
    folder: 'bashkortostan',
    seedFile: 'src/providers/data/bashkortostanSeed.json',
    placesFile: 'src/providers/data/bashkortostanPlaces.json',
    timezone: 'Asia/Yekaterinburg',
    source: 'https://dumrb.com/namaz',
    warnDays: 21,
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
