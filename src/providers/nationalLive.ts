/**
 * The authorities' own free APIs, asked by the phone only as a backup: a
 * national table's days come from Mihrab's repo (`tools/national-tables`
 * mirrors them there), and only a day the repo's copy and the bundled seed
 * both lack is asked of the source itself (October 2026 —
 * docs/prayer-times-sources.md). Each returns the source's days as the
 * shared tuple, or null when the source cannot be read.
 *
 * The parsing is the builder's (`tools/national-tables/jakim.ts`, `muis.ts`),
 * kept apart so the app does not carry the builder's file writing; a test
 * holds the two equal.
 */
import { httpUserAgent } from '../config/httpIdentity';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import type { DatasetDayTuple } from './datasetTuple';

const MALAY_MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mac: 3, Apr: 4, Mei: 5, Jun: 6, Jul: 7, Ogos: 8, Sep: 9, Okt: 10, Nov: 11, Dis: 12 };

const minutesOf = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const clock = (minutes: number): string => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const tuple = (m: number[]): DatasetDayTuple | null =>
  m.every(Number.isFinite) ? (m.map(clock) as DatasetDayTuple) : null;

type JakimRow = { date: string; imsak: string; fajr: string; syuruk: string; dhuhr: string; asr: string; maghrib: string; isha: string };

/** e-Solat's year for a zone: `{ "YYYY-MM-DD": [imsak, fajr, sunrise, dhuhr, asr, maghrib, isha] }`. */
export function parseJakimLive(json: { prayerTime?: JakimRow[] }): Record<string, DatasetDayTuple> {
  const days: Record<string, DatasetDayTuple> = {};
  for (const r of Array.isArray(json.prayerTime) ? json.prayerTime : []) {
    const d = /^(\d{1,2})-([A-Za-z]+)-(\d{4})$/.exec(r.date?.trim() ?? '');
    const month = d ? MALAY_MONTHS[d[2]] : undefined;
    if (!d || !month) continue;
    const fajr = minutesOf(r.fajr);
    let imsak = minutesOf(r.imsak);
    // Perlis prints its Imsak equal to Subuh; ten minutes stand in, as the builder does.
    if (imsak >= fajr) imsak = fajr - 10;
    const t = tuple([imsak, fajr, minutesOf(r.syuruk), minutesOf(r.dhuhr), minutesOf(r.asr), minutesOf(r.maghrib), minutesOf(r.isha)]);
    if (t) days[`${d[3]}-${String(month).padStart(2, '0')}-${d[1].padStart(2, '0')}`] = t;
  }
  return days;
}

/** MUIS's CSV (data.gov.sg): afternoon columns may be on a 12-hour clock. */
export function parseMuisLive(csv: string): Record<string, DatasetDayTuple> {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return {};
  const head = lines[0].split(',').map(s => s.trim());
  const col = (name: string) => head.indexOf(name);
  const c = { date: col('Date'), subuh: col('Subuh'), syuruk: col('Syuruk'), zohor: col('Zohor'), asar: col('Asar'), maghrib: col('Maghrib'), isyak: col('Isyak') };
  if (Object.values(c).some(i => i < 0)) return {};
  const pm = (s: string) => {
    const m = minutesOf(s);
    return m < 720 ? m + 720 : m;
  };
  const days: Record<string, DatasetDayTuple> = {};
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    const date = f[c.date]?.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const fajr = minutesOf(f[c.subuh]);
    const t = tuple([fajr - 10, fajr, minutesOf(f[c.syuruk]), pm(f[c.zohor]), pm(f[c.asar]), pm(f[c.maghrib]), pm(f[c.isyak])]);
    if (t) days[date] = t;
  }
  return days;
}

const headers = () => ({ 'User-Agent': httpUserAgent('Islamic prayer app; backup to the dataset') });

/** JAKIM's current year for a zone code ("SGR01"), from e-Solat. */
export async function fetchJakimLive(zoneCode: string): Promise<Record<string, DatasetDayTuple> | null> {
  if (!/^[A-Z]{3}\d{2}$/.test(zoneCode)) return null;
  try {
    const res = await fetchWithRetry(
      `https://www.e-solat.gov.my/index.php?r=esolatApi/takwimsolat&period=year&zone=${zoneCode}`,
      { headers: headers() },
      { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 12000 },
    );
    if (!res.ok) return null;
    const days = parseJakimLive((await res.json()) as { prayerTime?: JakimRow[] });
    return Object.keys(days).length ? days : null;
  } catch {
    return null;
  }
}

const MUIS_DATASET = 'd_a6a206cba471fe04b62dd886ef5eaf22';

/** MUIS's whole table, from the government's open-data portal. */
export async function fetchMuisLive(): Promise<Record<string, DatasetDayTuple> | null> {
  try {
    const poll = await fetchWithRetry(
      `https://api-open.data.gov.sg/v1/public/api/datasets/${MUIS_DATASET}/poll-download`,
      { headers: headers() },
      { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 9000 },
    );
    if (!poll.ok) return null;
    const url = ((await poll.json()) as { data?: { url?: string } }).data?.url;
    if (!url) return null;
    const res = await fetchWithRetry(url, { headers: headers() }, { maxAttempts: 2, baseDelayMs: 800, timeoutMs: 12000 });
    if (!res.ok) return null;
    const days = parseMuisLive(await res.text());
    return Object.keys(days).length ? days : null;
  } catch {
    return null;
  }
}

/** The zone code a JAKIM place names in brackets: "Pulau Aur (JHR01)" → "JHR01". */
export function jakimZoneCode(nameEn: string | undefined): string | null {
  return /\(([A-Z]{3}\d{2})\)\s*$/.exec(nameEn ?? '')?.[1] ?? null;
}
