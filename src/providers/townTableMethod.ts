/**
 * A reference town's table with the sun taken once a day — the arithmetic
 * Bulgaria's and Albania's timetables share.
 *
 * Both authorities print one table, computed for one town, and give every
 * other town as a whole number of minutes on it. Read off those tables:
 *
 *   • Meeus's apparent sun (Morocco's), taken **once for the whole day**:
 *     one declination and one equation of time, read at a fixed moment, and
 *     every time of the day computed from that pair — nothing iterated to a
 *     time's own moment;
 *   • Dhuhr from the transit, the other times the transit plus or minus the
 *     hour angle of their altitude: Fajr 18° and Isha 17° below the horizon,
 *     sunrise and Maghrib with the sun's centre 0.8333° below it, Asr one
 *     shadow length beyond the noon shadow;
 *   • a margin of whole minutes on each time (the old temkin: sunrise 7
 *     earlier, Dhuhr 5 later, Asr 4 later, Maghrib 7 later), then the
 *     nearest minute;
 *   • a town's times are the reference town's plus its whole minutes, which
 *     a listed town's point carries in its longitude (a quarter of a degree
 *     from the reference town's to the minute, west later).
 *
 * The moment the sun is taken at and the margin on Fajr are each
 * timetable's own (`bulgariaMethod.ts`, `albaniaMethod.ts`). From
 * MihrabHQ/mihrab-methods.
 */
import { meeusApparentSun } from './moroccoMethod';

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type TownTable = {
  /** The town the table is computed at. */
  lat: number;
  lon: number;
  /** When the day's sun is taken: days after 0h UT of the civil date (negative: before it). */
  sunAt: number;
  /** Minutes added to each time before rounding. */
  margins: { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number };
};

export type TownTableMinutes = { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number };

const FAJR = 18;
const ISHA = 17;
const HORIZON = 0.8333;

/** The whole minutes a town adds to the reference town's table (west later, east earlier). */
export function townMinutes(table: TownTable, longitude: number): number {
  return Math.floor((table.lon - longitude) * 4 + 0.5);
}

/**
 * The times with their margins, before rounding: minutes past 00:00 UT of
 * the civil date (month 0-based), for the town whose point has this
 * longitude.
 */
export function townTableRawMinutes(table: TownTable, longitude: number, year: number, month: number, day: number, asrShadow = 1): TownTableMinutes {
  const d0 = (Date.UTC(year, month, day) - Date.UTC(2000, 0, 1)) / DAY_MS - 0.5;
  const { dec, eot } = meeusApparentSun(d0 + table.sunAt);
  const add = townMinutes(table, longitude);
  const noon = 720 - 4 * table.lon - eot;
  const sp = Math.sin(table.lat * RAD);
  const cp = Math.cos(table.lat * RAD);
  const event = (altitude: number, sign: number): number => {
    const c = (Math.sin(altitude * RAD) - sp * Math.sin(dec)) / (cp * Math.cos(dec));
    return noon + (sign * 4 * Math.acos(c)) / RAD;
  };
  const asrAltitude = Math.atan(1 / (asrShadow + Math.tan(Math.abs(table.lat * RAD - dec)))) / RAD;
  const m = table.margins;
  return {
    fajr: event(-FAJR, -1) + m.fajr + add,
    sunrise: event(-HORIZON, -1) + m.sunrise + add,
    dhuhr: noon + m.dhuhr + add,
    asr: event(asrAltitude, 1) + m.asr + add,
    maghrib: event(-HORIZON, 1) + m.maghrib + add,
    isha: event(-ISHA, 1) + m.isha + add,
  };
}

export type TownTableInstants = { fajr: Date; sunrise: Date; dhuhr: Date; asr: Date; maghrib: Date; isha: Date };

/** The times for the civil date (month 0-based), each on the minute the timetable prints (rounded to the nearest). */
export function townTableTimes(table: TownTable, longitude: number, year: number, month: number, day: number, asrShadow = 1): TownTableInstants {
  const r = townTableRawMinutes(table, longitude, year, month, day, asrShadow);
  const start = Date.UTC(year, month, day);
  const at = (minutes: number) => new Date(start + Math.floor(minutes + 0.5) * 60_000);
  return { fajr: at(r.fajr), sunrise: at(r.sunrise), dhuhr: at(r.dhuhr), asr: at(r.asr), maghrib: at(r.maghrib), isha: at(r.isha) };
}
