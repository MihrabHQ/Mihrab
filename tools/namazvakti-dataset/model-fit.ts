/**
 * Scores the fallback model (the same rules as computeNamazvaktiMethodTimes)
 * against namazvakti.com years saved as /tmp/nvs/xml/<id>.xml — the cities
 * in calibrate.ts's CITIES, fetched with curl from XML.php?cityID=<id>.
 * Prints, per city and time, the share of days within 1 and 2 minutes.
 * The fitted constants: K=0.97 (temkin) and MK=0.5 (sunrise / Maghrib).
 */
import fs from 'node:fs';
import { CalculationMethod, Coordinates, Madhab, PrayerTimes, HighLatitudeRule } from 'adhan';
import { parseCityInfo } from './parse';
import { parseNamazvaktiXml, NV_COL } from '../../src/providers/namazvaktiParser';
import { CITIES } from './calibrate';

const K = Number(process.env.K ?? 0.97); // extra depression beyond the dip, degrees
const MK = Number(process.env.MK ?? 0.5); // maghrib/sunrise extra depression

function dipDeg(h: number) {
  return (Math.acos(6371000 / (6371000 + h)) * 180) / Math.PI;
}
/** Minutes for the sun, on the summer solstice, to go from 0° to −(dip + k). */
export function temkin(lat: number, h: number, k = K, exact = false): number {
  const phi = (Math.min(Math.abs(lat), 62) * Math.PI) / 180;
  const d = (23.44 * Math.PI) / 180;
  const H = (alt: number) =>
    Math.acos(Math.max(-1, Math.min(1, (Math.sin((alt * Math.PI) / 180) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)))));
  const t = (((H(-(dipDeg(h) + k)) - H(0)) * 180) / Math.PI) * 4;
  return exact ? t : Math.ceil(t);
}

const fmt = new Map<string, Intl.DateTimeFormat>();
function localExact(d: Date, tz: string): number {
  let f = fmt.get(tz);
  if (!f) fmt.set(tz, (f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })));
  const [h, m, s] = f.format(d).split(':').map(Number);
  return h * 60 + m + s / 60;
}

function model(lat: number, lon: number, h: number, y: number, m: number, dd: number) {
  const T = temkin(lat, h);
  const mk = (f: number, i: number) => {
    const c = CalculationMethod.Other();
    c.fajrAngle = f; c.ishaAngle = i; c.madhab = Madhab.Shafi; c.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight;
    c.rounding = 'none' as never;
    return new PrayerTimes(new Coordinates(lat, lon), new Date(y, m - 1, dd, 12), c);
  };
  const a = mk(19, 17), b = mk(18, 17);
  const Tm = temkin(lat, h, MK, true);
  const add = (d: Date, min: number) => new Date(d.getTime() + min * 60000);
  return {
    imsak: add(a.fajr, -T), sabah: b.fajr, sunrise: add(a.sunrise, -Tm), dhuhr: add(a.dhuhr, T),
    asr: add(a.asr, T), maghrib: add(a.maghrib, Tm), isha: add(a.isha, T),
  };
}

const KEYS = { imsak: NV_COL.imsak, sabah: NV_COL.sabah, sunrise: NV_COL.sunrise, dhuhr: NV_COL.dhuhr, asr: NV_COL.asr, maghrib: NV_COL.maghrib, isha: NV_COL.isha } as const;
const ROUND: Record<string, (x: number) => number> = { imsak: Math.floor, sabah: Math.ceil, sunrise: Math.ceil, dhuhr: Math.ceil, asr: Math.ceil, maghrib: Math.ceil, isha: Math.ceil };

let all1 = 0, all2 = 0, n = 0;
for (const [id, tz] of CITIES) {
  const file = `/tmp/nvs/xml/${id}.xml`;
  if (!fs.existsSync(file)) continue;
  const xml = fs.readFileSync(file, 'utf8');
  const info = parseCityInfo(xml);
  let year;
  try { year = parseNamazvaktiXml(xml, 2026, ''); } catch { continue; }
  if (!info) continue;
  const st: Record<string, [number, number, number, number[]]> = {};
  for (const [date, row] of Object.entries(year.days)) {
    if (!date.startsWith('2026')) continue;
    const [y, m, d] = date.split('-').map(Number);
    const r = model(info.lat, info.lon, info.height, y, m, d) as Record<string, Date>;
    for (const [k, col] of Object.entries(KEYS)) {
      const mm = /(\d{1,2}):(\d{2})/.exec(row[col] ?? '');
      if (!mm || row[col].includes('*') || isNaN(r[k].getTime())) continue;
      let diff = ROUND[k](localExact(r[k], tz)) - (Number(mm[1]) * 60 + Number(mm[2]));
      if (diff > 720) diff -= 1440;
      if (diff < -720) diff += 1440;
      const s = (st[k] ??= [0, 0, 0, []]);
      s[0]++; if (Math.abs(diff) <= 1) s[1]++; if (Math.abs(diff) <= 2) s[2]++; s[3].push(diff);
      n++; if (Math.abs(diff) <= 1) all1++; if (Math.abs(diff) <= 2) all2++;
    }
  }
  const line = Object.entries(st).map(([k, [c, w1, w2, ds]]) => {
    const srt = [...ds].sort((a, b) => a - b);
    return `${k} ${Math.round((100 * w1) / c)}/${Math.round((100 * w2) / c)}% med ${srt[srt.length >> 1]}`;
  });
  console.log(`${info.name.slice(0, 10).padEnd(10)} ${info.lat.toFixed(1).padStart(5)} T${temkin(info.lat, info.height)} | ${line.join(' | ')}`);
}
console.log(`ALL within1 ${((100 * all1) / n).toFixed(1)}% within2 ${((100 * all2) / n).toFixed(1)}%`);
