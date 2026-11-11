/**
 * Bulgaria — the Grand Mufti's Office's timetable, as its times are
 * computed.
 *
 * The Office prints one table, computed for Sofia, and gives forty-seven
 * other towns as whole minutes on it. It is a reference town's table with
 * the sun taken once a day (`townTableMethod.ts`; from MihrabHQ/mihrab-methods, revision 1):
 *
 *   • the day's sun is taken at 11h UT of the day before (thirteen hours
 *     before the date begins by Universal Time);
 *   • Fajr at 18°, a minute earlier; sunrise 7 minutes earlier, Dhuhr 5
 *     later, Asr 4 later, Maghrib 7 later; Isha at 17° with no margin; each
 *     to the nearest minute.
 *
 * This gives the Office's minute for about 98 % of the table; every other
 * time is a single minute away.
 */
import { townTableRawMinutes, townTableTimes, type TownTable, type TownTableInstants, type TownTableMinutes } from './townTableMethod';

/** Sofia's table. */
export const BULGARIA_TABLE: TownTable = {
  lat: 42.708,
  lon: 23.3219,
  sunAt: -13 / 24,
  margins: { fajr: -1, sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7, isha: 0 },
};

export type BulgariaInstants = TownTableInstants;

/** The times before rounding, minutes past 00:00 UT of the civil date (month 0-based), for the town whose point has this longitude. */
export function bulgariaRawMinutes(longitude: number, year: number, month: number, day: number, asrShadow = 1): TownTableMinutes {
  return townTableRawMinutes(BULGARIA_TABLE, longitude, year, month, day, asrShadow);
}

/** The Office's times for the civil date (month 0-based) in the town whose point has this longitude, each on the minute it prints. */
export function bulgariaTimes(longitude: number, year: number, month: number, day: number, asrShadow = 1): BulgariaInstants {
  return townTableTimes(BULGARIA_TABLE, longitude, year, month, day, asrShadow);
}
