/**
 * The provider matrix's world: places, dates, a network that answers the way
 * each source does (AlAdhan computed for the place on its own clock, the
 * repo's copies of the national tables and of namazvakti.com's index, the
 * site's own year files from the fixtures), and the checks every answer is
 * held to. Used by `__tests__/providerMatrix*.test.ts`.
 */
import fs from 'fs';
import path from 'path';
import { computeLocalAdhanInstants } from '../../src/providers/localAdhan';
import { formatInZone } from '../../src/providers/locationClock';
import { autoMethodForCoords } from '../../src/providers/autoMethod';
import {
  combineLocalDateAndTime,
  DEVICE_CLOCK,
} from '../../src/utils/prayerTimes';
import {
  civilInZone,
  deviceZone,
  zoneOffsetMinutes,
} from '../../src/utils/zoneClock';

const ROOT = path.join(__dirname, '..', '..');

export type Place = { name: string; lat: number; lon: number; zone: string };
const P = (name: string, lat: number, lon: number, zone: string): Place => ({
  name,
  lat,
  lon,
  zone,
});

export const PLACES = {
  Stockholm: P('Stockholm', 59.33, 18.07, 'Europe/Stockholm'),
  Karesuando: P('Karesuando', 68.44, 22.48, 'Europe/Stockholm'),
  Haparanda: P('Haparanda', 65.84, 24.14, 'Europe/Stockholm'),
  Tornio: P('Tornio', 65.85, 24.17, 'Europe/Helsinki'),
  BalticOff: P('BalticOff', 58.0, 19.8, 'Europe/Stockholm'),
  Oslo: P('Oslo', 59.91, 10.75, 'Europe/Oslo'),
  Kiruna: P('Kiruna', 67.86, 20.23, 'Europe/Stockholm'),
  Tromso: P('Tromso', 69.65, 18.96, 'Europe/Oslo'),
  Longyearbyen: P('Longyearbyen', 78.22, 15.65, 'Arctic/Longyearbyen'),
  Reykjavik: P('Reykjavik', 64.15, -21.94, 'Atlantic/Reykjavik'),
  Murmansk: P('Murmansk', 68.97, 33.08, 'Europe/Moscow'),
  Rabat: P('Rabat', 34.02, -6.84, 'Africa/Casablanca'),
  Bouarfa: P('Bouarfa', 32.53, -1.95, 'Africa/Casablanca'),
  Dakhla: P('Dakhla', 23.68, -15.96, 'Africa/Casablanca'),
  Ceuta: P('Ceuta', 35.89, -5.32, 'Africa/Ceuta'),
  Tlemcen: P('Tlemcen', 34.88, -1.32, 'Africa/Algiers'),
  MoroccoOff: P('MoroccoOff', 34.0, -7.6, 'Africa/Casablanca'),
  LasPalmas: P('LasPalmas', 28.1, -15.42, 'Atlantic/Canary'),
  Algiers: P('Algiers', 36.75, 3.06, 'Africa/Algiers'),
  Tamanrasset: P('Tamanrasset', 22.79, 5.52, 'Africa/Algiers'),
  Tunis: P('Tunis', 36.8, 10.18, 'Africa/Tunis'),
  AlgeriaOff: P('AlgeriaOff', 37.2, 3.0, 'Africa/Algiers'),
  Singapore: P('Singapore', 1.29, 103.85, 'Asia/Singapore'),
  JohorBahru: P('JohorBahru', 1.49, 103.74, 'Asia/Kuala_Lumpur'),
  KualaLumpur: P('KualaLumpur', 3.14, 101.69, 'Asia/Kuala_Lumpur'),
  SabahInterior: P('SabahInterior', 5.4, 116.5, 'Asia/Kuching'),
  SebatikMY: P('SebatikMY', 4.17, 117.8, 'Asia/Kuching'),
  SebatikID: P('SebatikID', 4.1, 117.85, 'Asia/Makassar'),
  Jakarta: P('Jakarta', -6.2, 106.85, 'Asia/Jakarta'),
  Pontianak: P('Pontianak', -0.03, 109.33, 'Asia/Pontianak'),
  Jayapura: P('Jayapura', -2.53, 140.72, 'Asia/Jayapura'),
  PapuaRemote: P('PapuaRemote', -4.1, 138.9, 'Asia/Jayapura'),
  JavaSeaOff: P('JavaSeaOff', -5.5, 107.5, 'Asia/Jakarta'),
  Dili: P('Dili', -8.56, 125.57, 'Asia/Dili'),
  Istanbul: P('Istanbul', 41.01, 28.98, 'Europe/Istanbul'),
  Van: P('Van', 38.5, 43.4, 'Europe/Istanbul'),
  Kas: P('Kas', 36.2, 29.64, 'Europe/Istanbul'),
  Kastellorizo: P('Kastellorizo', 36.15, 29.59, 'Europe/Athens'),
  NicosiaNorth: P('NicosiaNorth', 35.19, 33.36, 'Asia/Famagusta'),
  Batumi: P('Batumi', 41.64, 41.63, 'Asia/Tbilisi'),
  Cologne: P('Cologne', 50.94, 6.96, 'Europe/Berlin'),
  Mecca: P('Mecca', 21.42, 39.83, 'Asia/Riyadh'),
  Ushuaia: P('Ushuaia', -54.8, -68.3, 'America/Argentina/Ushuaia'),
  Christchurch: P('Christchurch', -43.53, 172.63, 'Pacific/Auckland'),
  Quito: P('Quito', -0.18, -78.47, 'America/Guayaquil'),
  Kiritimati: P('Kiritimati', 1.87, -157.4, 'Pacific/Kiritimati'),
  PagoPago: P('PagoPago', -14.28, -170.7, 'Pacific/Pago_Pago'),
  Suva: P('Suva', -18.14, 178.44, 'Pacific/Fiji'),
  Tehran: P('Tehran', 35.69, 51.39, 'Asia/Tehran'),
  Kolkata: P('Kolkata', 22.57, 88.36, 'Asia/Kolkata'),
  Kathmandu: P('Kathmandu', 27.7, 85.32, 'Asia/Kathmandu'),
  Adelaide: P('Adelaide', -34.93, 138.6, 'Australia/Adelaide'),
  NorthPole: P('NorthPole', 89.9, 0, 'UTC'),
  SouthPole: P('SouthPole', -89.9, 0, 'UTC'),
  NullIsland: P('NullIsland', 0, 0, 'UTC'),
} as const;
export type PlaceName = keyof typeof PLACES;

/** Places every provider is asked about, whatever its country: far north, date line, poles. */
export const EVERYWHERE: PlaceName[] = [
  'Tromso',
  'Longyearbyen',
  'Kiritimati',
  'PagoPago',
  'Kathmandu',
  'NorthPole',
  'NullIsland',
];

export const DATES = [
  '2026-10-17', // today
  '2026-10-25', // EU summer time ends
  '2026-11-01', // US summer time ends
  '2027-03-28', // EU summer time starts
  '2026-12-31', // the national tables' window ends
  '2027-01-01',
  '2027-01-03', // past namazvakti's file of 2026
  '2027-02-18', // Ramadan 1448 begins (about)
  '2027-03-04', // mid-Ramadan
  '2028-02-29', // leap day
  '2026-06-21',
  '2026-12-21',
  '2027-11-17', // thirteen months ahead: past every published window
];
/** The dates every place is asked about; the rest only for each provider's own cities. */
export const KEY_DATES = [
  '2026-10-17',
  '2026-12-31',
  '2027-01-03',
  '2026-06-21',
  '2027-11-17',
];

export const dayOf = (ds: string) => {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// ── the network ─────────────────────────────────────────────────────────

export type NetMode = 'online' | 'offline' | 'html' | 'truncated';
export const net = { mode: 'online' as NetMode, calls: [] as string[] };

const NV_XML: Record<number, string> = {
  16258: 'stockholm-16258.xml',
  16741: 'istanbul-16741.xml',
  5887: 'cologne-5887.xml',
};

export function response(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}

export const placeAt = (lat: number, lon: number): Place | undefined =>
  Object.values(PLACES).find(p => p.lat === lat && p.lon === lon);

/** AlAdhan's day for a place: the method computed there, written on the place's own clock. */
function aladhanBody(u: URL) {
  const [, dd, mm, yyyy] = /timings\/(\d\d)-(\d\d)-(\d{4})/.exec(u.pathname)!;
  const lat = Number(u.searchParams.get('latitude'));
  const lon = Number(u.searchParams.get('longitude'));
  const method = u.searchParams.get('method');
  const zone = placeAt(lat, lon)?.zone ?? 'UTC';
  const at = computeLocalAdhanInstants({
    latitude: lat,
    longitude: lon,
    date: new Date(Number(yyyy), Number(mm) - 1, Number(dd)),
    calculationMethod: method ? Number(method) : autoMethodForCoords(lat, lon),
    school: Number(u.searchParams.get('school') ?? 0),
  });
  const f = (d: Date) => formatInZone(d, zone);
  const timings = {
    Fajr: f(at.fajr),
    Sunrise: f(at.sunrise),
    Dhuhr: f(at.dhuhr),
    Asr: f(at.asr),
    Sunset: f(at.maghrib),
    Maghrib: f(at.maghrib),
    Isha: f(at.isha),
    Imsak: f(new Date(at.fajr.getTime() - 600_000)),
  };
  return JSON.stringify({
    code: 200,
    status: 'OK',
    data: { timings, meta: { timezone: zone } },
  });
}

export async function fakeFetch(url: string) {
  net.calls.push(url);
  if (net.mode === 'offline') throw new TypeError('Network request failed');
  if (net.mode === 'html')
    return response(
      200,
      '<!doctype html><html><body>Wi-Fi login</body></html>',
    );
  if (net.mode === 'truncated')
    return response(200, '{"code":200,"data":{"timings":{"Fajr":"05:');
  const u = new URL(url);
  if (u.host === 'api.aladhan.com') return response(200, aladhanBody(u));
  const nv = /namazvakti\/v1\/(tiles\/[^/]+\.json|index\.json)$/.exec(
    u.pathname,
  );
  if (nv) {
    const f = path.join(ROOT, 'data/prayer-times/namazvakti/v1', nv[1]);
    return fs.existsSync(f)
      ? response(200, fs.readFileSync(f, 'utf8'))
      : response(404, 'Not Found');
  }
  if (u.host === 'www.namazvakti.com') {
    const f = NV_XML[Number(u.searchParams.get('cityID'))];
    return f
      ? response(
          200,
          fs.readFileSync(
            path.join(ROOT, '__tests__/fixtures/namazvakti', f),
            'utf8',
          ),
        )
      : response(404, 'Not Found');
  }
  const nt = /(singapore|malaysia)\/v1\/(.*)$/.exec(u.pathname);
  if (nt) {
    const f = path.join(ROOT, 'data/prayer-times', nt[1], 'v1', nt[2]);
    return fs.existsSync(f)
      ? response(200, fs.readFileSync(f, 'utf8'))
      : response(404, 'Not Found');
  }
  // The authorities' own APIs, the release mirror, the correction lists: not reachable here.
  return response(404, 'Not Found');
}

// ── the checks ──────────────────────────────────────────────────────────

export const KEYS = [
  'Fajr',
  'Sunrise',
  'Dhuhr',
  'Asr',
  'Maghrib',
  'Isha',
] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type Answer = {
  timings: Record<string, string>;
  clock?: string;
  source?: string;
};

/** Minutes east of UTC of a zone on a day (the phone's own for 'device'). */
export function offsetOn(zone: string, day: Date): number {
  return zoneOffsetMinutes(zone, new Date(day.getTime() + 12 * 3_600_000)) ?? 0;
}

/**
 * Can this answer be read as instants on this phone? A day on a place's
 * clock always can. A day on the phone's clock ('device') is the place's
 * solar day written on the phone's clock, and the readers put every string
 * on the phone's date: that is the place's day only while the phone keeps
 * the place's offset. With the phone elsewhere a prayer near midnight lands
 * on the wrong date — Stockholm's midsummer Fajr (01:54 there) is 23:54 the
 * evening before on a phone in UTC — so those answers are not held to the
 * order or the cross-zone checks (reported: on-device answers carry no
 * place clock, and namazvakti.com's days are the city's clock tagged as the
 * phone's).
 */
export function readable(a: Answer, place: Place, day: Date): boolean {
  if (a.clock && a.clock !== DEVICE_CLOCK) return true;
  const here = deviceZone() ?? 'UTC';
  return offsetOn(here, day) === offsetOn(place.zone, day);
}

const DAY_MS = 86_400_000;
/**
 * The six times as instants (ms) on the clock the answer names. Isha may
 * pass midnight, and so may Maghrib where the sun sets after it
 * (Reykjavik, 21 June: 00:04) — both are then the next date's.
 */
export function instantsOf(a: Answer, day: Date): number[] {
  const out = KEYS.map(k =>
    combineLocalDateAndTime(day, a.timings[k], a.clock).getTime(),
  );
  if (out[4] < out[3] && out[4] + DAY_MS - out[3] <= 9 * 3_600_000)
    out[4] += DAY_MS;
  if (out[5] < out[4]) out[5] += DAY_MS;
  return out;
}

/** The place's own date the day is read on (the zone's date at the phone's noon). */
export function placeDateOf(a: Answer, day: Date): string {
  const zone =
    a.clock && a.clock !== DEVICE_CLOCK ? a.clock : deviceZone() ?? 'UTC';
  const c = civilInZone(
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12),
    zone,
  )!;
  return `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(
    2,
    '0',
  )}`;
}

/** Problems with one answer, as text; empty when it is sound. */
export function problemsWith(
  a: Answer,
  place: Place,
  day: Date,
  imsakMaxMin = 30,
): string[] {
  const out: string[] = [];
  const t = a.timings;
  for (const k of KEYS)
    if (!HHMM.test(t[k] ?? '')) out.push(`${k} is ${JSON.stringify(t[k])}`);
  if (Object.values(t).some(v => typeof v === 'string' && v.includes('NaN')))
    out.push('NaN');
  if (!a.clock) out.push('no clock');
  else if (a.clock !== DEVICE_CLOCK && !civilInZone(day, a.clock))
    out.push(`unreadable clock ${a.clock}`);
  if (out.length) return out;
  if (!readable(a, place, day)) return out;
  const ins = instantsOf(a, day);
  for (let i = 1; i < 6; i++) {
    const ok = ins[i - 1] < ins[i];
    // Documented: Diyanet's and the Swedish tables print an Asr that never
    // forms (polar night) at Dhuhr's time (`congressMethod.ts`).
    const polarAsr =
      KEYS[i] === 'Asr' && ins[i - 1] === ins[i] && Math.abs(place.lat) > 60;
    if (!ok && !polarAsr) {
      out.push(
        `${KEYS[i - 1]} not before ${KEYS[i]}: ${JSON.stringify(t)} on ${
          a.clock
        }`,
      );
      break;
    }
  }
  if (!t.Imsak || !HHMM.test(t.Imsak))
    out.push(`Imsak is ${JSON.stringify(t.Imsak)}`);
  else {
    let gap = ins[0] - combineLocalDateAndTime(day, t.Imsak, a.clock).getTime();
    if (gap < 0) gap += 86_400_000;
    // Ten minutes by default; the Türkiye Takvimi's own İmsâk is further ahead in the north.
    if (gap > imsakMaxMin * 60_000)
      out.push(`Imsak ${t.Imsak} is ${gap / 60_000} min before Fajr ${t.Fajr}`);
  }
  return out;
}
