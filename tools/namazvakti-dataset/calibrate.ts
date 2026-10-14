/**
 * Measures namazvakti.com's tables against plain astronomy, city by city:
 * for each time, the site minus the bare adhan time (no adjustments), as
 * median and 10th/90th percentile over the year. Used to fit the phone's
 * fallback method (computeNamazvaktiMethodTimes).
 *   npx tsx tools/namazvakti-dataset/calibrate.ts
 */
import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan';
import { parseCityInfo } from './parse';
import { parseNamazvaktiXml, NV_COL } from '../../src/providers/namazvaktiParser';

export const CITIES: [number, string][] = [
  [15050, 'Asia/Riyadh'], [4983, 'Africa/Cairo'], [10569, 'Asia/Karachi'], [747, 'Australia/Sydney'],
  [16709, 'Europe/Istanbul'], [16741, 'Europe/Istanbul'], [19839, 'America/New_York'], [3568, 'America/Toronto'],
  [5887, 'Europe/Berlin'], [18403, 'Europe/London'], [16258, 'Europe/Stockholm'], [10373, 'Europe/Oslo'],
  [10429, 'Europe/Oslo'], [16347, 'Europe/Stockholm'], [6314, 'Atlantic/Reykjavik'], [16157, 'Europe/Stockholm'],
  [16142, 'Europe/Stockholm'], [10482, 'Europe/Oslo'],
];

const fmtCache = new Map<string, Intl.DateTimeFormat>();
export function localMin(d: Date, tz: string): number {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    fmtCache.set(tz, f);
  }
  const [h, m] = f.format(d).split(':').map(Number);
  return h * 60 + m + (d.getUTCSeconds() >= 30 ? 1 : 0);
}

const KEYS = { imsak: NV_COL.imsak, sabah: NV_COL.sabah, sunrise: NV_COL.sunrise, dhuhr: NV_COL.dhuhr, asr: NV_COL.asr, maghrib: NV_COL.maghrib, isha: NV_COL.isha } as const;

function raw(lat: number, lon: number, y: number, m: number, d: number) {
  const mk = (f: number, i: number) => {
    const c = CalculationMethod.Other();
    c.fajrAngle = f; c.ishaAngle = i; c.madhab = Madhab.Shafi; c.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight;
    // Noon in UTC of that civil day, so the day is the city's whatever the host zone.
    return new PrayerTimes(new Coordinates(lat, lon), new Date(y, m - 1, d, 12), c);
  };
  const a = mk(19, 17), b = mk(18, 17);
  return { imsak: a.fajr, sabah: b.fajr, sunrise: a.sunrise, dhuhr: a.dhuhr, asr: a.asr, maghrib: a.maghrib, isha: a.isha };
}

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export const main = async () => {
  for (const [id, tz] of CITIES) {
    await new Promise(r => setTimeout(r, 300));
    const xml = await (await fetch(`https://www.namazvakti.com/XML.php?cityID=${id}`)).text();
    const info = parseCityInfo(xml);
    let year;
    try {
      year = parseNamazvaktiXml(xml, 2026, new Date().toISOString());
    } catch (e) {
      console.log(id, (e as Error).message);
      continue;
    }
    if (!info) continue;
    const diffs: Record<string, number[]> = {};
    for (const [date, row] of Object.entries(year.days)) {
      if (!date.startsWith('2026')) continue;
      const [y, m, d] = date.split('-').map(Number);
      const r = raw(info.lat, info.lon, y, m, d);
      for (const [k, col] of Object.entries(KEYS)) {
        const cell = row[col];
        const mm = /(\d{1,2}):(\d{2})/.exec(cell ?? '');
        if (!mm || cell.includes('*')) continue;
        const site = Number(mm[1]) * 60 + Number(mm[2]);
        const t = (r as Record<string, Date>)[k];
        if (!t || isNaN(t.getTime())) continue;
        let diff = site - localMin(t, tz);
        if (diff > 720) diff -= 1440;
        if (diff < -720) diff += 1440;
        (diffs[k] ??= []).push(diff);
      }
    }
    const cols = Object.keys(KEYS).map(k => {
      const xs = diffs[k] ?? [];
      return xs.length ? `${k} ${q(xs, 0.5)} [${q(xs, 0.1)},${q(xs, 0.9)}] n${xs.length}` : `${k} -`;
    });
    console.log(`${info.name.padEnd(12)} lat ${info.lat.toFixed(1).padStart(5)} h ${String(info.height).padStart(4)} | ${cols.join(' | ')}`);
  }
};
if (require.main === module) void main();
