/**
 * Malaysia — JAKIM's zone times, as its e-Solat tables are computed.
 *
 * A zone's time is not one town's. Read off the tables for all 59 zones,
 * 2024–2026 (`tools/verify-methods/README.md`), each time is the extreme of
 * the zone: the sun at Fajr 18°, Isha 18°, sunrise and Maghrib at the
 * apparent horizon (−0°50′), Dhuhr at the transit, Asr at the shadow's
 * length plus the noon shadow — computed at a few points of the zone, the
 * latest of them taken (the earliest for sunrise, which ends Fajr), a
 * margin added and the minute rounded up. The points and margins are
 * fitted per zone and prayer (`data/jakimMethodZones.json`); Johor's and
 * Pahang's Asr take the noon shadow from the declination at 00:00 UT of
 * the day, as Kemenag's does.
 *
 * Fitted on 2025–2026 and checked on 2024, the zone's printed minute for
 * most times; some states' Dhuhr and Asr, and Kedah's times generally,
 * follow a rule not yet read (see the README).
 */
import { preciseApparentSun } from './preciseSun';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

/** Per zone (1-based, as `jakim-zones.ts` orders them): per prayer [margin min, points [lat, lon][]], and the Asr rule. */
type ZoneFit = { c: [number, number[][]][]; asr0h?: number };
const ZONES = require('./data/jakimMethodZones.json') as Record<string, ZoneFit>;

export type JakimInstants = { fajr: Date; sunrise: Date; dhuhr: Date; asr: Date; maghrib: Date; isha: Date };

const ALT: Record<number, number> = { 0: -18, 1: -0.833, 4: -0.833, 5: -18 };
const SIGN = [-1, -1, 0, 1, 1, 1];

/** Exact zone times with the margins, minutes past 00:00 UT of the civil date (month 0-based), before rounding. */
export function jakimRawMinutes(zone: number, year: number, month: number, day: number, asrShadow = 1): number[] | null {
  const fit = ZONES[String(zone)];
  if (!fit) return null;
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const at = (t: number) => preciseApparentSun(d0 + t / 1440);
  const dec0h = at(0).dec;
  const time = (c: number, lat: number, lon: number): number => {
    let noon = 720 - 4 * lon - at(720 - 4 * lon).eot;
    noon = 720 - 4 * lon - at(noon).eot;
    if (c === 2) return noon;
    const sp = Math.sin(lat * RAD), cp = Math.cos(lat * RAD);
    let t = noon + SIGN[c] * 360;
    for (let i = 0; i < 3; i++) {
      const { dec, eot } = at(t);
      const shadowDec = c === 3 && fit.asr0h ? dec0h : dec;
      const alt = c === 3 ? Math.atan(1 / (asrShadow + Math.tan(Math.abs(lat * RAD - shadowDec)))) / RAD : ALT[c];
      const x = (Math.sin(alt * RAD) - sp * Math.sin(dec)) / (cp * Math.cos(dec));
      t = 720 - 4 * lon - eot + (SIGN[c] * 4 * Math.acos(Math.max(-1, Math.min(1, x)))) / RAD;
    }
    return t;
  };
  return fit.c.map(([margin, points], c) => {
    const ts = points.map(([lat, lon]) => time(c, lat, lon));
    return (c === 1 ? Math.min(...ts) : Math.max(...ts)) + margin;
  });
}

/** JAKIM's times for a zone and civil date (month 0-based), on the minute; null for a zone with no fit. */
export function jakimTimes(zone: number, year: number, month: number, day: number, asrShadow = 1): JakimInstants | null {
  const r = jakimRawMinutes(zone, year, month, day, asrShadow);
  if (!r || !r.every(Number.isFinite)) return null;
  const start = Date.UTC(year, month, day);
  const at = (m: number) => new Date(start + Math.ceil(m - 1e-9) * 60_000);
  return { fajr: at(r[0]), sunrise: at(r[1]), dhuhr: at(r[2]), asr: at(r[3]), maghrib: at(r[4]), isha: at(r[5]) };
}
